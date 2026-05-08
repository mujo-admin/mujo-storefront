// Handler: customer.subscription.created
//
// Loop migration zero-touch coupon attach. When a subscription is created
// via the Loop migration Payment Link (sub.metadata.loop_migration is set
// from the Payment Link's subscription_data.metadata), automatically
// attach the MUJO_SUB_15 coupon so the migrated subscriber pays the
// member rate without typing a promo code.
//
// Idempotent: if MUJO_SUB_15 (or any matching discount) is already
// attached — e.g., subscription was created via Mujo's own /checkout
// which sets discounts at creation time, or this handler already ran for
// a re-fired event — the handler logs + skips. Subscriptions without
// metadata.loop_migration are ignored entirely (they're not migration
// subs and shouldn't get this coupon attached automatically).
//
// Mirroring (status / period / etc.) into our `subscriptions` table is
// handled by customer.subscription.updated — it fires when the discount
// attach lands. So this handler intentionally does NOT call
// syncSubscriptionToDb. Single-purpose: coupon attach.

import type Stripe from 'stripe';
import { stripe } from 'lib/stripe';
import { SUBSCRIPTION_COUPON_ID } from 'lib/stripe-constants';

export async function handleSubscriptionCreated(event: Stripe.Event) {
  if (event.type !== 'customer.subscription.created') return;
  const sub = event.data.object;

  // Only act on Loop migration subs.
  const migrationTag = sub.metadata?.loop_migration;
  if (!migrationTag) {
    return;
  }

  if (!SUBSCRIPTION_COUPON_ID) {
    console.warn(
      '[sub.created/migration] STRIPE_SUBSCRIPTION_COUPON_ID not set — cannot attach coupon',
      { subId: sub.id, migrationTag },
    );
    return;
  }

  // Idempotency: re-retrieve with discounts expanded so we can check
  // whether MUJO_SUB_15 is already on the sub. The webhook payload's
  // `discounts` field comes back as IDs unless the destination is
  // configured to auto-expand, which we don't rely on.
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

  // Attach the coupon. Stripe will fire customer.subscription.updated as
  // a result, which the existing subscription-updated handler will mirror
  // to our `subscriptions` table.
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
