/**
 * Phase 7 pre-flight: programmatic checks against Stripe sandbox.
 * Read-only; no mutations.
 */
import 'dotenv/config'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-04-22.dahlia',
})

type Check = { label: string; ok: boolean; detail: string }
const out: Check[] = []
const push = (label: string, ok: boolean, detail: string) =>
  out.push({ label, ok, detail })

async function checkTax() {
  try {
    const settings = await stripe.tax.settings.retrieve()
    push(
      'Stripe Tax: settings status',
      settings.status === 'active',
      `status=${settings.status} · default tax behavior=${settings.defaults?.tax_behavior ?? '?'}`,
    )
    const products = await stripe.products.list({ active: true, limit: 100 })
    const ritual = products.data.filter((p) =>
      /ritual|vitality/i.test(p.name),
    )
    for (const p of ritual) {
      push(
        `Stripe product tax_code: ${p.name}`,
        p.tax_code === 'txcd_41054002',
        `tax_code=${p.tax_code ?? 'unset'}`,
      )
    }
  } catch (e: unknown) {
    push('Stripe Tax', false, `ERROR ${(e as Error).message}`)
  }
}

async function checkCoupon() {
  try {
    const c = await stripe.coupons.retrieve('MUJO_SUB_15')
    push(
      'MUJO_SUB_15 coupon',
      c.percent_off === 15 && c.duration === 'forever' && c.valid,
      `percent_off=${c.percent_off}% · duration=${c.duration} · valid=${c.valid}`,
    )
  } catch (e: unknown) {
    push('MUJO_SUB_15 coupon', false, `ERROR ${(e as Error).message}`)
  }
}

async function checkPromoCode() {
  try {
    const codes = await stripe.promotionCodes.list({
      code: 'LOOPMIG2026',
      limit: 5,
    })
    if (codes.data.length === 0) {
      push(
        'LOOPMIG2026 promo code',
        false,
        'NOT FOUND — re-run loop-migration-payment-link.ts',
      )
      return
    }
    const pc = codes.data[0] as Stripe.PromotionCode & {
      promotion?: { coupon?: string; type?: string }
    }
    const couponId = pc.promotion?.coupon ?? '(unset)'
    push(
      'LOOPMIG2026 promo code',
      pc.active && couponId === 'MUJO_SUB_15',
      `active=${pc.active} · coupon=${couponId}`,
    )
  } catch (e: unknown) {
    push('LOOPMIG2026 promo code', false, `ERROR ${(e as Error).message}`)
  }
}

async function checkWebhooks() {
  try {
    const eps = await stripe.webhookEndpoints.list({ limit: 100 })
    if (eps.data.length === 0) {
      push('Stripe webhook endpoints', false, 'NO endpoints configured')
      return
    }
    for (const ep of eps.data) {
      const required = [
        'payment_intent.succeeded',
        'customer.subscription.created',
        'customer.subscription.updated',
        'invoice.paid',
        'checkout.session.completed',
        'charge.failed',
        'charge.refunded',
      ]
      const events = ep.enabled_events as string[]
      const allEvents = events.includes('*')
      const missing = allEvents
        ? []
        : required.filter((e) => !events.includes(e))
      push(
        `Webhook ${ep.id}`,
        ep.status === 'enabled' && missing.length === 0,
        `${ep.url} · status=${ep.status} · events=${events.length}${missing.length ? ` · MISSING: ${missing.join(', ')}` : ''}`,
      )
    }
  } catch (e: unknown) {
    push('Stripe webhook endpoints', false, `ERROR ${(e as Error).message}`)
  }
}

async function main() {
  await Promise.all([checkTax(), checkCoupon(), checkPromoCode(), checkWebhooks()])
  // Print as a tidy table
  const max = Math.max(...out.map((c) => c.label.length))
  for (const c of out) {
    const tick = c.ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
    console.log(`${tick} ${c.label.padEnd(max + 2)}${c.detail}`)
  }
  const failed = out.filter((c) => !c.ok).length
  console.log(`\n${out.length - failed}/${out.length} checks passed`)
  process.exit(failed > 0 ? 1 : 0)
}

main()
