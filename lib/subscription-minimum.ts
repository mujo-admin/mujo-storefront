// The two-delivery subscription minimum, in one place.
//
// The subscriber price, free shipping and free frother are offered against a
// commitment of two deliveries. How that is honoured (decided 2026-11-23 after
// a review of state auto-renewal laws, see the AIOS briefing in
// outputs/legal-and-compliance/subscription-minimum-2026-11/):
//
//   - CANCEL always works online, at any time. Before the second delivery the
//     cancellation is saved straight away and takes effect right after that
//     delivery: the commitment is honoured, the cancel button never refuses.
//   - PAUSE and SKIP are not cancellation; they open after the second delivery.

import { count, eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db, orderMirror } from 'db';
import { stripe } from 'lib/stripe';
import { RITUAL_LEGACY_SUB_PRICE_IDS } from 'lib/stripe-constants';

export const MINIMUM_DELIVERIES = 2;

/** Subscription metadata flag: cancellation saved, effective after delivery two. */
export const CANCEL_AFTER_MINIMUM_KEY = 'cancel_after_minimum';

/** Every order made for this subscription: first, renewals, "send now". */
export async function deliveriesSoFar(stripeSubscriptionId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(orderMirror)
    .where(eq(orderMirror.stripeSubscriptionId, stripeSubscriptionId));
  return row?.n ?? 0;
}

/**
 * True while a subscription still owes part of its two-delivery minimum.
 * Long-standing subscribers (legacy Prices, or moved over from Loop) had their
 * first deliveries before orders were recorded here: never under the minimum.
 */
export async function isUnderMinimum(sub: {
  stripeSubscriptionId: string;
  stripePriceId: string;
  metadata: unknown;
}): Promise<boolean> {
  const metadata = (sub.metadata ?? {}) as Record<string, unknown>;
  if (RITUAL_LEGACY_SUB_PRICE_IDS.includes(sub.stripePriceId) || metadata.loop_migration) {
    return false;
  }
  return (await deliveriesSoFar(sub.stripeSubscriptionId)) < MINIMUM_DELIVERIES;
}

export function hasSavedCancellation(
  metadata: Stripe.Metadata | Record<string, unknown> | null | undefined,
): boolean {
  return (metadata as Record<string, unknown> | null | undefined)?.[CANCEL_AFTER_MINIMUM_KEY] === '1';
}

/**
 * Called after each subscription order is recorded. If the subscriber asked to
 * cancel before their second delivery, the minimum is now met: end the
 * subscription at the close of the period that was just paid for, so there is
 * no further charge. Safe to call again on a webhook retry.
 */
export async function applySavedCancellation(sub: Stripe.Subscription): Promise<boolean> {
  if (!hasSavedCancellation(sub.metadata)) return false;
  if (sub.cancel_at_period_end || sub.status === 'canceled') return false;
  if ((await deliveriesSoFar(sub.id)) < MINIMUM_DELIVERIES) return false;
  const feedback = sub.metadata?.cancel_feedback as
    | Stripe.SubscriptionUpdateParams.CancellationDetails.Feedback
    | undefined;
  const comment = sub.metadata?.cancel_comment || undefined;
  await stripe.subscriptions.update(sub.id, {
    cancel_at_period_end: true,
    // The reason the customer gave when they asked, now that Stripe accepts it.
    ...(feedback || comment
      ? { cancellation_details: { ...(feedback ? { feedback } : {}), ...(comment ? { comment } : {}) } }
      : {}),
  });
  console.log('[subscription-minimum] minimum met, saved cancellation applied', { sub: sub.id });
  return true;
}
