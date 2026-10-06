// Creates SANDBOX Stripe payments for proving the Stripe → Shopify order mirror.
// Pair with scripts/replay-stripe-event.ts (runs the handlers) and
// scripts/compare-order.ts (Stripe vs Shopify side by side).
//
//   pnpm tsx scripts/sandbox-order-scenarios.ts prices
//   pnpm tsx scripts/sandbox-order-scenarios.ts session <priceId:qty,…> [--state IL|CA] [--email x]
//       → prints a Stripe-hosted checkout URL (same session settings as the site)
//   pnpm tsx scripts/sandbox-order-scenarios.ts sub <priceId> <qty> [--promo CODE] [--frother <priceId>]
//       → subscription on a test clock, first invoice paid (invoice.paid event)
//   pnpm tsx scripts/sandbox-order-scenarios.ts renew <sub_id>
//       → advances the test clock past the next cycle (renewal invoice.paid)
//   pnpm tsx scripts/sandbox-order-scenarios.ts gift <cus_id> <priceId>
//       → off-session gift PaymentIntent (payment_intent.succeeded)
//   pnpm tsx scripts/sandbox-order-scenarios.ts refund <ch_id> [cents]
//   pnpm tsx scripts/sandbox-order-scenarios.ts cleanup [--apply]
//       → lists (and with --apply removes) everything the test email created:
//         cancels Shopify test orders, deletes order_mirror / subscriptions /
//         customers rows, cancels sandbox subscriptions.
//
// Sandbox only. Everything hangs off ONE dedicated test email so clean-up can
// find it and no real customer row is ever touched.

import { config } from 'dotenv';
config({ path: '.env.local' });

export const TEST_EMAIL = 'kinga+ordertest@mujo.life';

const ADDRESSES = {
  IL: { line1: '233 S Wacker Dr', city: 'Chicago', state: 'IL', postal_code: '60606', country: 'US' },
  CA: { line1: '1 Ferry Building', city: 'San Francisco', state: 'CA', postal_code: '94111', country: 'US' },
} as const;

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test')) {
    throw new Error('Refusing to run: STRIPE_SECRET_KEY is not a sandbox (sk_test) key.');
  }
  const { stripe } = await import('lib/stripe');
  const [cmd, ...args] = process.argv.slice(2);
  const email = flag(args, '--email') ?? TEST_EMAIL;
  const state = (flag(args, '--state') ?? 'IL') as keyof typeof ADDRESSES;
  const address = ADDRESSES[state];

  if (cmd === 'prices') {
    const prices = await stripe.prices.list({ active: true, limit: 100, expand: ['data.product'] });
    for (const p of prices.data) {
      const product = typeof p.product === 'object' && !('deleted' in p.product && p.product.deleted) ? p.product.name : '?';
      const cadence = p.recurring ? `every ${p.recurring.interval_count} ${p.recurring.interval}` : 'one-time';
      console.log(
        `${p.id}  $${((p.unit_amount ?? 0) / 100).toFixed(2).padStart(7)}  ${cadence.padEnd(15)} ${product}` +
          `${p.metadata?.shopify_variant_id ? '' : '  [no variant]'}${p.metadata?.mujo_role ? `  (${p.metadata.mujo_role})` : ''}`,
      );
    }
    return;
  }

  if (cmd === 'session') {
    const items = (args[0] ?? '').split(',').map((pair) => {
      const [price, qty] = pair.split(':');
      return { price: price!, quantity: Number(qty ?? 1) };
    });
    const priceObjs = await Promise.all(items.map((i) => stripe.prices.retrieve(i.price)));
    const subtotal = priceObjs.reduce((sum, p, idx) => sum + (p.unit_amount ?? 0) * items[idx]!.quantity, 0);
    const { FREE_SHIPPING_THRESHOLD_CENTS, SHIPPING_RATE_FLAT_ID, SHIPPING_RATE_FREE_ID } = await import(
      'lib/stripe-constants'
    );
    // Mirrors app/api/checkout-session (payment mode), but Stripe-hosted so it
    // can be completed without the storefront running.
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: 'https://example.com/paid?session_id={CHECKOUT_SESSION_ID}',
      line_items: items,
      automatic_tax: { enabled: true },
      shipping_address_collection: { allowed_countries: ['US'] },
      shipping_options: [
        { shipping_rate: subtotal >= FREE_SHIPPING_THRESHOLD_CENTS ? SHIPPING_RATE_FREE_ID : SHIPPING_RATE_FLAT_ID },
      ],
      allow_promotion_codes: true,
      customer_email: email,
      customer_creation: 'always',
      metadata: { reconcile_test: 'true' },
    });
    console.log(session.id);
    console.log(session.url);
    return;
  }

  if (cmd === 'sub') {
    const [priceId, qty] = args;
    const promo = flag(args, '--promo');
    const frother = flag(args, '--frother');
    const clock = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
      name: `reconcile ${new Date().toISOString()}`,
    });
    const customer = await stripe.customers.create({
      email,
      name: 'Order Test',
      test_clock: clock.id,
      address,
      shipping: { name: 'Order Test', address },
      metadata: { reconcile_test: 'true' },
    });
    const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
    let promotionCodeId: string | undefined;
    if (promo) {
      promotionCodeId = (await stripe.promotionCodes.list({ code: promo, active: true, limit: 1 })).data[0]?.id;
      if (!promotionCodeId) throw new Error(`Promotion code ${promo} not found in the sandbox`);
    }
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: priceId!, quantity: Number(qty ?? 1) }],
      ...(frother ? { add_invoice_items: [{ price: frother, quantity: 1 }] } : {}),
      ...(promotionCodeId ? { discounts: [{ promotion_code: promotionCodeId }] } : {}),
      automatic_tax: { enabled: true },
      payment_behavior: 'error_if_incomplete',
      metadata: { reconcile_test: 'true' },
    });
    const invoiceId = typeof sub.latest_invoice === 'string' ? sub.latest_invoice : sub.latest_invoice?.id;
    console.log(JSON.stringify({ customer: customer.id, subscription: sub.id, invoice: invoiceId, clock: clock.id }));
    return;
  }

  if (cmd === 'renew') {
    const sub = await stripe.subscriptions.retrieve(args[0]!);
    const customer = await stripe.customers.retrieve(sub.customer as string);
    const clockId = !customer.deleted && typeof customer.test_clock === 'string' ? customer.test_clock : null;
    if (!clockId) throw new Error('Subscription customer is not on a test clock');
    const periodEnd = sub.items.data[0]!.current_period_end;
    await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: periodEnd + 3600 });
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 3000));
      const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
      if (clock.status === 'ready') break;
    }
    // The renewal invoice finalises ~1h after it is drafted; nudge it through.
    const invoices = await stripe.invoices.list({ subscription: sub.id, limit: 3 });
    for (const inv of invoices.data) {
      if (inv.status === 'draft' && inv.id) {
        await stripe.invoices.finalizeInvoice(inv.id);
        await stripe.invoices.pay(inv.id);
      }
    }
    const after = await stripe.invoices.list({ subscription: sub.id, limit: 3 });
    console.log(JSON.stringify(after.data.map((i) => ({ id: i.id, reason: i.billing_reason, status: i.status, paid: i.amount_paid }))));
    return;
  }

  if (cmd === 'gift') {
    const [customerId, priceId] = args;
    const price = await stripe.prices.retrieve(priceId!);
    const customer = await stripe.customers.retrieve(customerId!);
    if (customer.deleted) throw new Error('customer deleted');
    const pm = customer.invoice_settings?.default_payment_method;
    const pi = await stripe.paymentIntents.create({
      amount: price.unit_amount ?? 0,
      currency: price.currency,
      customer: customer.id,
      payment_method: typeof pm === 'string' ? pm : pm?.id,
      off_session: true,
      confirm: true,
      receipt_email: customer.email ?? email,
      shipping: { name: 'Gift Recipient', address: ADDRESSES.CA },
      // Same metadata shape as /api/account/subscription/send-gift.
      metadata: {
        mujo_event_id: `reconcile-${Date.now()}`,
        line_items: JSON.stringify([{ price: price.id, quantity: 1 }]),
        gift_order: 'true',
        gift_message: 'Reconciliation test gift',
        gift_sender_email: customer.email ?? email,
        gift_recipient_email: email,
      },
    });
    console.log(JSON.stringify({ paymentIntent: pi.id, status: pi.status, charge: pi.latest_charge }));
    return;
  }

  if (cmd === 'refund') {
    const [chargeId, cents] = args;
    const refund = await stripe.refunds.create({
      charge: chargeId!,
      ...(cents ? { amount: Number(cents) } : {}),
    });
    console.log(JSON.stringify({ refund: refund.id, amount: refund.amount, status: refund.status }));
    return;
  }

  if (cmd === 'cleanup') {
    const apply = args.includes('--apply');
    const { db, customers, orderMirror, subscriptions } = await import('db');
    const { adminFetch } = await import('lib/shopify-admin');
    const { eq } = await import('drizzle-orm');

    const rows = await db.select().from(customers).where(eq(customers.email, TEST_EMAIL));
    console.log(`app-DB customers for ${TEST_EMAIL}: ${rows.length}`);
    for (const c of rows) {
      const orders = await db.select().from(orderMirror).where(eq(orderMirror.customerId, c.id));
      const subs = await db.select().from(subscriptions).where(eq(subscriptions.customerId, c.id));
      console.log(`  customer ${c.id} · ${orders.length} order_mirror rows · ${subs.length} subscription rows`);
      for (const o of orders) {
        const gid = `gid://shopify/Order/${o.shopifyOrderId}`;
        const data = await adminFetch<{ order: { name: string; test: boolean; cancelledAt: string | null; email: string | null } | null }>({
          query: `query($id: ID!) { order(id: $id) { name test cancelledAt email } }`,
          variables: { id: gid },
        });
        const order = data.order;
        const safe = !!order && order.test && order.email === TEST_EMAIL;
        console.log(`    ${o.shopifyOrderName} test=${order?.test} cancelled=${!!order?.cancelledAt} ${safe ? '' : '← NOT a test order for the test email, will be left alone'}`);
        if (apply && safe && !order.cancelledAt) {
          const res = await adminFetch<{ orderCancel: { orderCancelUserErrors: Array<{ message: string }> } }>({
            query: `mutation($id: ID!) { orderCancel(orderId: $id, reason: OTHER, refund: false, restock: false, notifyCustomer: false) { orderCancelUserErrors { message } } }`,
            variables: { id: gid },
          });
          const errs = res.orderCancel.orderCancelUserErrors;
          console.log(`      cancel: ${errs.length ? errs.map((e) => e.message).join('; ') : 'ok'}`);
        }
        if (apply && safe) await db.delete(orderMirror).where(eq(orderMirror.id, o.id));
      }
      if (apply) {
        await db.delete(subscriptions).where(eq(subscriptions.customerId, c.id));
        const left = await db.select({ id: orderMirror.id }).from(orderMirror).where(eq(orderMirror.customerId, c.id));
        if (left.length === 0) await db.delete(customers).where(eq(customers.id, c.id));
      }
    }
    const stripeCustomers = await stripe.customers.list({ email: TEST_EMAIL, limit: 100 });
    console.log(`sandbox Stripe customers for ${TEST_EMAIL}: ${stripeCustomers.data.length}`);
    for (const c of stripeCustomers.data) {
      const subs = await stripe.subscriptions.list({ customer: c.id, status: 'active', limit: 20 });
      for (const s of subs.data) {
        console.log(`  active subscription ${s.id}`);
        if (apply) await stripe.subscriptions.cancel(s.id);
      }
    }
    console.log(apply ? 'cleanup applied' : 'dry run — pass --apply to remove');
    return;
  }

  throw new Error('Unknown command. See the header of this file.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
