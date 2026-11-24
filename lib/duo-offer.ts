// Black Friday 2026: the Daily Ritual Duo.
//
// One rule, applied by the checkout by itself, no code to type:
//   - one-time Ritual + one-time Protein Powder in the same cart
//       -> $16 off ($89 instead of $105), a free frother, free shipping
//   - Ritual subscription + Protein Powder subscription in the same cart
//       -> $21 off the first delivery ($69 instead of $90), then the normal
//          subscriber prices. Subscriptions already ship free with a frother.
//
// The Protein Powder is never discounted on its own (Kinga, 2026-11-23): the
// offer exists only for the pair. It ends by itself at the end of November 30
// Pacific time. Remove this file and its callers after the offer has ended.
//
// Shared by the browser (cart drawer, /duo page, top bar) and the server
// (checkout route, Shopify order tags), so it holds no secrets.

import {
  DUO_ONETIME_COUPON_ID,
  DUO_SUBSCRIPTION_COUPON_ID,
} from "lib/duo-offer-ids";
import { PROTEIN_PRICE_IDS, RITUAL_PRICE_IDS } from "lib/stripe-constants";

/** Stripe needs the two coupons to exist before this is switched on. */
export const DUO_OFFER_ENABLED =
  process.env.NEXT_PUBLIC_DUO_OFFER_ENABLED === "true";

/** Monday November 30, 2026, 11:59:59 pm Pacific. */
export const DUO_OFFER_ENDS_AT_MS = Date.UTC(2026, 11, 1, 7, 59, 59);
/** The site announces it to everyone from Friday November 27, midnight Pacific.
 *  Before that only the email list has the link (Thursday early access). */
export const DUO_PUBLIC_FROM_MS = Date.UTC(2026, 10, 27, 8, 0, 0);

export {
  DUO_ONETIME_COUPON_ID,
  DUO_ORDER_TAG,
  DUO_SUBSCRIPTION_COUPON_ID,
} from "lib/duo-offer-ids";

/** Must equal the amount_off of the matching Stripe coupon. */
export const DUO_ONETIME_DISCOUNT_CENTS = 1600;
export const DUO_SUBSCRIPTION_DISCOUNT_CENTS = 2100;

export type DuoKind = "onetime" | "subscription";

export function duoOfferActive(nowMs: number = Date.now()): boolean {
  return DUO_OFFER_ENABLED && nowMs <= DUO_OFFER_ENDS_AT_MS;
}

export function duoOfferPublic(nowMs: number = Date.now()): boolean {
  return duoOfferActive(nowMs) && nowMs >= DUO_PUBLIC_FROM_MS;
}

const RITUAL_SUB_IDS: string[] = [
  RITUAL_PRICE_IDS["25-subscription"],
  RITUAL_PRICE_IDS["25-subscription-6wk"],
  RITUAL_PRICE_IDS["25-subscription-8wk"],
  RITUAL_PRICE_IDS["25-subscription-12wk"],
].filter(Boolean);

const PROTEIN_SUB_IDS: string[] = [
  PROTEIN_PRICE_IDS["sub-2wk"],
  PROTEIN_PRICE_IDS["sub-4wk"],
  PROTEIN_PRICE_IDS["sub-6wk"],
  PROTEIN_PRICE_IDS["sub-8wk"],
].filter(Boolean);

/**
 * Which duo, if any, a set of cart lines earns. Looks only at what is in the
 * cart, not at the date: pair it with duoOfferActive().
 *
 * A cart holding any subscription checks out in subscription mode, so the
 * one-time duo needs a cart with no subscription line at all; such a cart
 * earns the subscription duo only when both products are subscriptions.
 */
export function duoKindForLines(
  lines: ReadonlyArray<{ stripePriceId: string; isSubscription?: boolean }>,
): DuoKind | null {
  const ids = new Set(lines.map((l) => l.stripePriceId));
  const hasAny = (candidates: string[]) => candidates.some((id) => ids.has(id));

  const anySubscription =
    lines.some((l) => l.isSubscription === true) ||
    hasAny(RITUAL_SUB_IDS) ||
    hasAny(PROTEIN_SUB_IDS);

  if (anySubscription) {
    return hasAny(RITUAL_SUB_IDS) && hasAny(PROTEIN_SUB_IDS)
      ? "subscription"
      : null;
  }

  const ritualOnce = RITUAL_PRICE_IDS["25-onetime"];
  const proteinOnce = PROTEIN_PRICE_IDS.onetime;
  return ritualOnce &&
    proteinOnce &&
    ids.has(ritualOnce) &&
    ids.has(proteinOnce)
    ? "onetime"
    : null;
}

export function duoDiscountCents(kind: DuoKind | null): number {
  if (kind === "onetime") return DUO_ONETIME_DISCOUNT_CENTS;
  if (kind === "subscription") return DUO_SUBSCRIPTION_DISCOUNT_CENTS;
  return 0;
}

export function duoCouponId(kind: DuoKind): string {
  return kind === "onetime"
    ? DUO_ONETIME_COUPON_ID
    : DUO_SUBSCRIPTION_COUPON_ID;
}
