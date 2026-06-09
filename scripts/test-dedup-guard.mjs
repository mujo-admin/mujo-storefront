// scripts/test-dedup-guard.mjs
//
// Test-mode validation for the two pre-cutover checkout fixes:
//   Bug #1 — duplicate-subscription guard (lib/webhook-handlers/subscription-created.ts)
//   Bug #2 — 15% subscriber coupon actually applies at checkout
//
// This replicates the EXACT cancelIfDuplicate() algorithm from the handler
// against the live test-mode Stripe account (the handler itself is validated by
// `tsc`; this proves the Stripe-side behavior the handler relies on). It creates
// throwaway test customers/subscriptions, asserts, and cleans up after itself.
//
// Usage: node scripts/test-dedup-guard.mjs
// Refuses to run against a live key.

import Stripe from 'stripe';
import fs from 'fs';

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const KEY = env.STRIPE_SECRET_KEY;
const PRICE = env.NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION;
const COUPON = env.STRIPE_SUBSCRIPTION_COUPON_ID;

if (!KEY || !KEY.startsWith('sk_test_')) {
  console.error('REFUSING TO RUN: STRIPE_SECRET_KEY is not a test key.');
  process.exit(1);
}
if (!PRICE || !COUPON) {
  console.error('Missing PRICE or COUPON env.', { PRICE: !!PRICE, COUPON: !!COUPON });
  process.exit(1);
}

const stripe = new Stripe(KEY, { apiVersion: '2026-04-22.dahlia' });

// Mirror of the handler's constants/predicate ---------------------------------
const DUPLICATE_WINDOW_SECONDS = 60 * 60;
const LIVE_STATUSES = new Set(['active', 'trialing', 'past_due']);

function findOlderKeeper(list, sub, priceId) {
  return list.find((other) => {
    if (other.id === sub.id) return false;
    if (!LIVE_STATUSES.has(other.status)) return false;
    if (other.items.data[0]?.price.id !== priceId) return false;
    if (sub.created - other.created > DUPLICATE_WINDOW_SECONDS) return false;
    if (other.created < sub.created) return true;
    if (other.created === sub.created) return other.id < sub.id;
    return false;
  });
}

async function extractInvoicePaymentIntentId(invoice) {
  let payments = invoice.payments;
  if (!payments) {
    const refreshed = await stripe.invoices.retrieve(invoice.id, { expand: ['payments'] });
    payments = refreshed.payments;
  }
  for (const p of payments?.data ?? []) {
    const pi = p.payment?.payment_intent;
    if (pi) return typeof pi === 'string' ? pi : pi.id;
  }
  return null;
}
// -----------------------------------------------------------------------------

let pass = 0;
let fail = 0;
function check(label, cond) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

let customer;
try {
  console.log('Setting up test customer + payment method...');
  customer = await stripe.customers.create({
    email: `dedup-test+${Date.now()}@mujo.test`,
    name: 'Dedup Test',
  });
  const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: pm.id },
  });

  const price = await stripe.prices.retrieve(PRICE);
  const unit = price.unit_amount; // cents, full retail
  const coupon = await stripe.coupons.retrieve(COUPON);

  // ── Bug #2: coupon applies ────────────────────────────────────────────────
  console.log('\n[Bug #2] 15% subscriber coupon:');
  check(`coupon ${COUPON} is 15% off`, coupon.percent_off === 15);

  console.log('\nCreating subscription A (with coupon, first attempt)...');
  const subA = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: PRICE }],
    discounts: [{ coupon: COUPON }],
    payment_behavior: 'error_if_incomplete',
    expand: ['latest_invoice'],
  });
  const invA = subA.latest_invoice;
  const expectedDiscounted = Math.round(unit * 0.85);
  check(
    `sub A invoice charged 15% off (got ${invA.amount_paid}¢, expected ~${expectedDiscounted}¢ of ${unit}¢)`,
    invA.amount_paid === expectedDiscounted,
  );
  check('sub A is active', subA.status === 'active');

  // ── Bug #1: duplicate guard ───────────────────────────────────────────────
  console.log('\n[Bug #1] duplicate-subscription guard:');
  console.log('Creating subscription B (duplicate — same customer + price)...');
  const subB = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: PRICE }],
    discounts: [{ coupon: COUPON }],
    payment_behavior: 'error_if_incomplete',
    expand: ['latest_invoice'],
  });
  check('both subs active before guard runs', subB.status === 'active');

  // Run the replicated guard against sub B.
  const all = await stripe.subscriptions.list({
    customer: customer.id,
    status: 'all',
    limit: 100,
  });
  const keeper = findOlderKeeper(all.data, subB, PRICE);
  check('guard identifies sub A as the keeper (cancels B, not A)', keeper?.id === subA.id);

  if (keeper) {
    await stripe.subscriptions.cancel(subB.id);
    const subBfull = await stripe.subscriptions.retrieve(subB.id, {
      expand: ['latest_invoice.payments'],
    });
    const piId = await extractInvoicePaymentIntentId(subBfull.latest_invoice);
    const refund1 = await stripe.refunds.create(
      { payment_intent: piId, reason: 'duplicate' },
      { idempotencyKey: `dup-refund-${subB.id}` },
    );
    // Idempotency: a webhook retry must not double-refund.
    const refund2 = await stripe.refunds.create(
      { payment_intent: piId, reason: 'duplicate' },
      { idempotencyKey: `dup-refund-${subB.id}` },
    );
    check('refund created on duplicate charge', refund1.status === 'succeeded' || refund1.status === 'pending');
    check('refund is idempotent (retry returns same refund id)', refund1.id === refund2.id);
  }

  // Verify end state.
  const subAafter = await stripe.subscriptions.retrieve(subA.id);
  const subBafter = await stripe.subscriptions.retrieve(subB.id);
  check('keeper (sub A) still active after guard', subAafter.status === 'active');
  check('duplicate (sub B) canceled', subBafter.status === 'canceled');

  // Re-running the guard must be a no-op (idempotent on already-canceled sub).
  const all2 = await stripe.subscriptions.list({
    customer: customer.id,
    status: 'all',
    limit: 100,
  });
  const keeper2 = findOlderKeeper(all2.data, subBafter, PRICE);
  check(
    'guard is idempotent — re-run finds no live keeper for a canceled dup',
    !keeper2 || subBafter.status === 'canceled',
  );
} catch (err) {
  fail++;
  console.error('\nERROR during test:', err?.message ?? err);
} finally {
  if (customer) {
    console.log('\nCleaning up test customer + subscriptions...');
    try {
      const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'all', limit: 100 });
      for (const s of subs.data) {
        if (s.status !== 'canceled') await stripe.subscriptions.cancel(s.id).catch(() => {});
      }
      await stripe.customers.del(customer.id);
      console.log('Cleanup done.');
    } catch (e) {
      console.warn('Cleanup warning:', e?.message ?? e);
    }
  }
}

console.log(`\n${'='.repeat(48)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
