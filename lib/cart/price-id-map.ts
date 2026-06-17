import { RITUAL_PRICE_IDS, type RitualCadence } from "lib/stripe-constants";
import type { CartLineItem } from "./types";
import { resolveMerchPriceId } from "./merch-config";

/**
 * Resolves a Stripe Price ID to enough product metadata to render a cart line.
 * Used by:
 *  - imported-page-runtime.tsx — when a button with `data-stripe-price-id` is
 *    clicked, we look up the product copy/handle/image here.
 *  - ritual-pdp-client.tsx — same lookup but the price ID comes from the
 *    in-component (size, plan) state.
 *
 * Future: when Lemna PDP wires up, add LEMNA_PRICE_IDS entries below. For
 * non-Mujo-canonical products the runtime falls back to a generic "Mujo
 * Product" line; the buyer sees correct copy on /products/<handle> next time.
 */

type PriceIdResolution = Pick<
  CartLineItem,
  | "productHandle"
  | "productTitle"
  | "variantTitle"
  | "image"
  | "unitAmountCents"
  | "currency"
  | "isSubscription"
>;

// Cart line-item thumbnails. Point at real square masters in public/images —
// the old /products/*.png paths didn't exist and rendered a broken-image box.
const RITUAL_IMAGE_25 = {
  url: "/images/products/ritual/ritual-pouch-hero-monumental-editorial-1x1.webp",
  alt: "The Mujo Ritual pouch",
};
const RITUAL_IMAGE_10 = {
  url: "/images/products/ritual/ritual-pouch-10-serving-hero-monumental-editorial-1x1.webp",
  alt: "The Mujo Ritual pouch, 10 servings",
};

type RitualKey = keyof typeof RITUAL_PRICE_IDS;

// 10-serving is one-time only — small bag costs more to produce, so it
// never ships as a subscription and never carries the MUJO_SUB_15 discount.
const RITUAL_LINES: Record<RitualKey, PriceIdResolution> = {
  "10-onetime": {
    productHandle: "mujo-ritual",
    productTitle: "The Ritual",
    variantTitle: "10 servings · One-time",
    image: RITUAL_IMAGE_10,
    unitAmountCents: 2700,
    currency: "usd",
    isSubscription: false,
  },
  "25-onetime": {
    productHandle: "mujo-ritual",
    productTitle: "The Ritual",
    variantTitle: "25 servings · One-time",
    image: RITUAL_IMAGE_25,
    unitAmountCents: 6500,
    currency: "usd",
    isSubscription: false,
  },
  "25-subscription": {
    productHandle: "mujo-ritual",
    productTitle: "The Ritual",
    variantTitle: "25 servings · Subscribe · every 4 weeks",
    image: RITUAL_IMAGE_25,
    unitAmountCents: 5525,
    currency: "usd",
    isSubscription: true,
  },
  "25-subscription-6wk": {
    productHandle: "mujo-ritual",
    productTitle: "The Ritual",
    variantTitle: "25 servings · Subscribe · every 6 weeks",
    image: RITUAL_IMAGE_25,
    unitAmountCents: 5525,
    currency: "usd",
    isSubscription: true,
  },
  "25-subscription-8wk": {
    productHandle: "mujo-ritual",
    productTitle: "The Ritual",
    variantTitle: "25 servings · Subscribe · every 8 weeks",
    image: RITUAL_IMAGE_25,
    unitAmountCents: 5525,
    currency: "usd",
    isSubscription: true,
  },
  "25-subscription-12wk": {
    productHandle: "mujo-ritual",
    productTitle: "The Ritual",
    variantTitle: "25 servings · Subscribe · every 12 weeks",
    image: RITUAL_IMAGE_25,
    unitAmountCents: 5525,
    currency: "usd",
    isSubscription: true,
  },
};

/** Resolve any Mujo Stripe Price ID to a cart-line shape. Null if unknown. */
export function resolvePriceId(
  stripePriceId: string,
  hint?: { isSubscription?: boolean },
): PriceIdResolution | null {
  for (const key of Object.keys(RITUAL_PRICE_IDS) as RitualKey[]) {
    if (RITUAL_PRICE_IDS[key] === stripePriceId) {
      return RITUAL_LINES[key];
    }
  }
  const merch = resolveMerchPriceId(stripePriceId);
  if (merch) return merch;
  // Unknown Price ID — return a generic line so the cart still works on
  // pages that haven't been wired into RITUAL_LINES yet (e.g. Lemna PDP
  // pre-launch). The on-site checkout is still authoritative on price.
  if (hint?.isSubscription !== undefined) {
    return {
      productHandle: "shop",
      productTitle: "Mujo Product",
      variantTitle: hint.isSubscription ? "Subscribe & save" : "One-time",
      image: { url: "/og-default.png", alt: "Mujo" },
      unitAmountCents: 0,
      currency: "usd",
      isSubscription: hint.isSubscription,
    };
  }
  return null;
}

/**
 * Given (size, plan, cadence), return both the Stripe Price ID and resolved
 * metadata. `cadence` only applies to 25-serving subscriptions; '6wk'/'8wk'/'12wk'
 * select the every-6 / 8 / 12-weeks Price, anything else the primary
 * every-4-weeks Price.
 */
export function resolveRitualSelection(
  size: "10" | "25",
  plan: "onetime" | "subscription",
  cadence: RitualCadence = "4wk",
): { stripePriceId: string; line: PriceIdResolution } | null {
  const isRitualSub = plan === "subscription" && size === "25";
  const cadenceKey: Record<RitualCadence, RitualKey> = {
    "4wk": "25-subscription",
    "6wk": "25-subscription-6wk",
    "8wk": "25-subscription-8wk",
    "12wk": "25-subscription-12wk",
  };
  const key: RitualKey = isRitualSub
    ? cadenceKey[cadence]
    : (`${size}-${plan}` as RitualKey);
  const stripePriceId = RITUAL_PRICE_IDS[key];
  if (!stripePriceId) return null;
  return { stripePriceId, line: RITUAL_LINES[key] };
}
