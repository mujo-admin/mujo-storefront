// Handler: customer.subscription.created
//
// Two responsibilities, in order:
//
//   1. Duplicate-subscription guard (ALL subs). If this customer already has a
//      live subscription for the same Price created within the last hour, this
//      newly-created sub is a rapid double-submit (the May 2026 bug: one
//      customer, 3 pay attempts → 3 active subs billing forever). Cancel this
//      duplicate immediately and refund its initial charge. Idempotent.
//
//   2. Loop migration coupon attach (migration subs only). When a sub is created
//      via the Loop migration Payment Link (sub.metadata.loop_migration set),
//      auto-attach MUJO_SUB_15 so the migrated subscriber pays the member rate
//      without typing a promo code.
//
// Mirroring (status / period / etc.) into our `subscriptions` table is handled
// by customer.subscription.updated + invoice.paid — this handler does NOT call
// syncSubscriptionToDb. Single-purpose: dedup + (migration) coupon attach.

import type Stripe from 'stripe';
import { stripe } from 'lib/stripe';
import { SUBSCRIPTION_COUPON_ID } from 'lib/stripe-constants';
import { extractInvoicePaymentIntentId } from './_helpers';

// Only rapid double-submits are duplicates. A customer who deliberately starts
// a second subscription weeks/months later is NOT a billing bug and must never
// be auto-canceled — so the guard only fires when the earlier live sub was
// created within this window of the new one.
const DUPLICATE_WINDOW_SECONDS = 60 * 60; // 1 hour

// Subscription statuses that represent a real, billing (or about-to-bill) sub.
// `incomplete` / `incomplete_expired` / `canceled` never count as a "keeper".
const LIVE_STATUSES = new Set<Stripe.Subscription.Status>([
  'active',
  'trialing',
  'past_due',
]);

export async function handleSubscriptionCreated(event: Stripe.Event) {
  if (event.type !== 'customer.subscription.created') return;
  const sub = event.data.object;

  // 1. Dedup guard — if this sub was a duplicate, it's now canceled + refunded;
  //    nothing else to do (don't bother attaching a coupon to a dead sub).
  const wasDuplicate = await cancelIfDuplicate(sub);
  if (wasDuplicate) return;

  // 2. Loop migration coupon attach (migration subs only).
  await attachMigrationCoupon(sub);
}

/**
 * If `sub` duplicates an earlier live subscription on the same customer for the
 * same Price (created within DUPLICATE_WINDOW_SECONDS), cancel `sub` and refund
 * its initial charge. Returns true if `sub` was canceled as a duplicate.
 *
 * Deterministic keeper selection: the EARLIER-created sub is kept (tie-break by
 * subscription id). So across the N webhook events for N rapid duplicates, each
 * event independently cancels its own sub iff an older keeper exists — only the
 * single oldest survives, with no cross-event coordination needed.
 */
async function cancelIfDuplicate(sub: Stripe.Subscription): Promise<boolean> {
  const customerId =
    typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  const thisPriceId = sub.items.data[0]?.price.id;
  if (!thisPriceId) return false;

  const all = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  });

  const olderKeeper = all.data.find((other) => {
    if (other.id === sub.id) return false;
    if (!LIVE_STATUSES.has(other.status)) return false;
    if (other.items.data[0]?.price.id !== thisPriceId) return false;
    if (sub.created - other.created > DUPLICATE_WINDOW_SECONDS) return false;
    // Keep the earlier-created sub; tie-break on id for determinism.
    if (other.created < sub.created) return true;
    if (other.created === sub.created) return other.id < sub.id;
    return false;
  });

  if (!olderKeeper) return false;

  // Idempotency: if a retry already canceled this sub, don't refund twice
  // (the refund is also idempotency-keyed below, but skip the work).
  const current = await stripe.subscriptions.retrieve(sub.id);
  if (current.status === 'canceled' || current.status === 'incomplete_expired') {
    return true;
  }

  await stripe.subscriptions.cancel(sub.id);
  await refundDuplicateCharge(sub.id);

  console.warn('[sub.created/dedup] canceled duplicate subscription', {
    duplicate: sub.id,
    keeper: olderKeeper.id,
    customerId,
    price: thisPriceId,
  });
  return true;
}

/**
 * Refund the duplicate subscription's initial charge, if one was taken.
 * Idempotency-keyed on the sub id so a webhook retry can't double-refund.
 */
async function refundDuplicateCharge(subId: string): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subId, {
    expand: ['latest_invoice.payments'],
  });
  const invoice = sub.latest_invoice;
  if (!invoice || typeof invoice === 'string') return;

  const paymentIntentId = await extractInvoicePaymentIntentId(invoice, stripe);
  if (!paymentIntentId) return;

  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.status !== 'succeeded') return; // nothing captured → nothing to refund

  await stripe.refunds.create(
    { payment_intent: paymentIntentId, reason: 'duplicate' },
    { idempotencyKey: `dup-refund-${subId}` },
  );
  console.warn('[sub.created/dedup] refunded duplicate charge', {
    subId,
    paymentIntent: paymentIntentId,
  });
}

/** Loop migration zero-touch coupon attach. No-op for non-migration subs. */
async function attachMigrationCoupon(sub: Stripe.Subscription): Promise<void> {
  const migrationTag = sub.metadata?.loop_migration;
  if (!migrationTag) return;

  if (!SUBSCRIPTION_COUPON_ID) {
    console.warn(
      '[sub.created/migration] STRIPE_SUBSCRIPTION_COUPON_ID not set — cannot attach coupon',
      { subId: sub.id, migrationTag },
    );
    return;
  }

  // Idempotency: re-retrieve with discounts expanded so we can check whether
  // MUJO_SUB_15 is already on the sub. The webhook payload's `discounts` field
  // comes back as IDs unless the destination auto-expands, which we don't rely on.
  const expanded = await stripe.subscriptions.retrieve(sub.id, {
    expand: ['discounts.source.coupon'],
  });

  const alreadyAttached = (expanded.discounts ?? []).some((d) => {
    if (typeof d !== 'object' || d === null) return false;
    const discount = d as Stripe.Discount;
    const couponRef = discount.source?.coupon;
    if (!couponRef) return false;
    if (typeof couponRef === 'string') return couponRef === SUBSCRIPTION_COUPON_ID;
    return couponRef.id === SUBSCRIPTION_COUPON_ID;
  });

  if (alreadyAttached) {
    console.log('[sub.created/migration] coupon already attached, skipping', {
      subId: sub.id,
      migrationTag,
    });
    return;
  }

  // Attach the coupon. Stripe will fire customer.subscription.updated as a
  // result, which the existing subscription-updated handler mirrors to our
  // `subscriptions` table.
  await stripe.subscriptions.update(sub.id, {
    discounts: [{ coupon: SUBSCRIPTION_COUPON_ID }],
  });

  const stripeCustomerId =
    typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  console.log('[sub.created/migration] MUJO_SUB_15 coupon attached', {
    subId: sub.id,
    stripeCustomerId,
    migrationTag,
    coupon: SUBSCRIPTION_COUPON_ID,
  });
}
