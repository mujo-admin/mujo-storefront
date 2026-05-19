/**
 * Phase 7 iPhone walks — backend verification helper.
 * Run after each checkout step to verify Stripe + Postgres + Klaviyo state.
 *
 * Usage:
 *   pnpm tsx --env-file=.env.local scripts/walk-verify.ts <email>
 */
import 'dotenv/config'
import Stripe from 'stripe'
import postgres from 'postgres'

const email = process.argv[2]
if (!email) {
  console.error('Usage: pnpm tsx scripts/walk-verify.ts <email>')
  process.exit(1)
}
const emailArg: string = email

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})
const sql = postgres(
  process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL!,
  { ssl: 'require' },
)

async function main() {
  console.log(`\n=== Verifying state for ${emailArg} ===\n`)

  // --- Stripe Customer + most-recent activity ---
  const customers = await stripe.customers.list({ email: emailArg, limit: 5 })
  const c = customers.data[0]
  if (!c) {
    console.log('  ✗ Stripe Customer: NOT FOUND')
  } else {
    console.log(`  ✓ Stripe Customer: ${c.id} (${customers.data.length} total)`)
    // PaymentIntents
    const pis = await stripe.paymentIntents.list({ customer: c.id, limit: 5 })
    for (const pi of pis.data) {
      console.log(
        `    PI ${pi.id}  amount=$${(pi.amount / 100).toFixed(2)} ${pi.currency.toUpperCase()}  status=${pi.status}  created=${new Date(pi.created * 1000).toISOString().slice(0, 19)}`,
      )
    }
    // Subscriptions — discount path in dahlia is discounts[].source.coupon (not discounts[].coupon).
    const subs = await stripe.subscriptions.list({ customer: c.id, limit: 5, expand: ['data.discounts'] })
    for (const s of subs.data) {
      const discount = (s as Stripe.Subscription & {
        discounts?: Array<{ id?: string; source?: { coupon?: string; type?: string }; end?: number | null }>
      }).discounts?.[0]
      const couponId = discount?.source?.coupon ?? 'none'
      const endDesc = discount?.end == null ? 'forever' : new Date(discount.end * 1000).toISOString().slice(0, 10)
      console.log(
        `    Sub ${s.id}  status=${s.status}  coupon=${couponId} (until ${endDesc})  cancel_at_period_end=${s.cancel_at_period_end}`,
      )
    }
    // Invoices (separate from sub.discounts to confirm coupon actually applied at billing time)
    const invs = await stripe.invoices.list({ customer: c.id, limit: 3 })
    for (const inv of invs.data) {
      console.log(
        `    Inv ${inv.id}  amount=$${(inv.amount_paid / 100).toFixed(2)}  status=${inv.status}`,
      )
    }
  }

  // --- Postgres mirror state ---
  const customerRow = await sql`
    SELECT id, email, shopify_customer_id, stripe_customer_id, created_at
    FROM customers WHERE email = ${emailArg} LIMIT 1
  `
  const r = customerRow[0]
  if (!r) {
    console.log('\n  ✗ Postgres customers row: NOT FOUND')
  } else {
    console.log(`\n  ✓ Postgres customer ${r.id}  shopify=${r.shopify_customer_id ?? 'null'}  stripe=${r.stripe_customer_id ?? 'null'}`)
    const orders = await sql`
      SELECT type, shopify_order_name, amount_cents, currency, stripe_charge_id, created_at
      FROM order_mirror WHERE customer_id = ${r.id}
      ORDER BY created_at DESC LIMIT 5
    `
    for (const o of orders) {
      console.log(
        `    Order ${(o.type as string).padEnd(15)} $${((o.amount_cents as number) / 100).toFixed(2)} ${o.currency}  shop=${o.shopify_order_name ?? '?'}  ${(o.created_at as Date).toISOString().slice(0, 19)}`,
      )
    }
    const subs = await sql`
      SELECT stripe_subscription_id, status
      FROM subscriptions WHERE customer_id = ${r.id} ORDER BY created_at DESC LIMIT 5
    `
    for (const s of subs) {
      console.log(`    Sub  ${s.stripe_subscription_id}  status=${s.status}`)
    }
  }

  // --- Klaviyo profile lookup ---
  const kv = process.env.KLAVIYO_PRIVATE_API_KEY!
  const profileR = await fetch(
    `https://a.klaviyo.com/api/profiles/?filter=${encodeURIComponent(`equals(email,"${email}")`)}`,
    {
      headers: {
        Authorization: `Klaviyo-API-Key ${kv}`,
        accept: 'application/vnd.api+json',
        revision: '2024-10-15',
      },
    },
  )
  const profileJ = await profileR.json()
  const profile = profileJ.data?.[0]
  if (!profile) {
    console.log('\n  ✗ Klaviyo profile: NOT FOUND')
  } else {
    console.log(
      `\n  ✓ Klaviyo profile ${profile.id}  created=${profile.attributes.created?.slice(0, 19)}`,
    )
    // Recent events with metric names resolved via include
    const eventsR = await fetch(
      `https://a.klaviyo.com/api/events/?filter=${encodeURIComponent(`equals(profile_id,"${profile.id}")`)}&include=metric&page[size]=10&sort=-datetime`,
      {
        headers: {
          Authorization: `Klaviyo-API-Key ${kv}`,
          accept: 'application/vnd.api+json',
          revision: '2024-10-15',
        },
      },
    )
    const eventsJ = await eventsR.json()
    const metricMap: Record<string, string> = {}
    for (const inc of eventsJ.included ?? []) {
      if (inc.type === 'metric') metricMap[inc.id] = inc.attributes.name
    }
    for (const e of (eventsJ.data ?? []).slice(0, 8)) {
      const metricId = e.relationships?.metric?.data?.id ?? '?'
      const metricName = metricMap[metricId] ?? metricId
      console.log(
        `    Event ${e.attributes.datetime?.slice(11, 19)}  ${metricName}`,
      )
    }
  }

  await sql.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
