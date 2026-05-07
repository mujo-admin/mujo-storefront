import { RITUAL_PRICE_IDS } from 'lib/stripe-constants';
import type { CartLineItem } from './types';

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
  | 'productHandle'
  | 'productTitle'
  | 'variantTitle'
  | 'image'
  | 'unitAmountCents'
  | 'currency'
  | 'isSubscription'
>;

const RITUAL_IMAGE = {
  url: '/products/mujo-ritual-25-servings.png',
  alt: 'The Mujo Ritual canister, 25 servings',
};

type RitualKey = keyof typeof RITUAL_PRICE_IDS;

// (size · plan) → cart line metadata for Mujo Ritual Stripe Prices.
const RITUAL_LINES: Record<RitualKey, PriceIdResolution> = {
  '10-onetime': {
    productHandle: 'mujo-ritual',
    productTitle: 'The Ritual',
    variantTitle: '10 servings · One-time',
    image: RITUAL_IMAGE,
    unitAmountCents: 2700,
    currency: 'usd',
    isSubscription: false,
  },
  '10-subscription': {
    productHandle: 'mujo-ritual',
    productTitle: 'The Ritual',
    variantTitle: '10 servings · Subscribe & save',
    image: RITUAL_IMAGE,
    unitAmountCents: 2295,
    currency: 'usd',
    isSubscription: true,
  },
  '25-onetime': {
    productHandle: 'mujo-ritual',
    productTitle: 'The Ritual',
    variantTitle: '25 servings · One-time',
    image: RITUAL_IMAGE,
    unitAmountCents: 6500,
    currency: 'usd',
    isSubscription: false,
  },
  '25-subscription': {
    productHandle: 'mujo-ritual',
    productTitle: 'The Ritual',
    variantTitle: '25 servings · Subscribe & save',
    image: RITUAL_IMAGE,
    unitAmountCents: 5525,
    currency: 'usd',
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
  // Unknown Price ID — return a generic line so the cart still works on
  // pages that haven't been wired into RITUAL_LINES yet (e.g. Lemna PDP
  // pre-launch). The on-site checkout is still authoritative on price.
  if (hint?.isSubscription !== undefined) {
    return {
      productHandle: 'shop',
      productTitle: 'Mujo Product',
      variantTitle: hint.isSubscription ? 'Subscribe & save' : 'One-time',
      image: { url: '/og-default.png', alt: 'Mujo' },
      unitAmountCents: 0,
      currency: 'usd',
      isSubscription: hint.isSubscription,
    };
  }
  return null;
}

/** Given (size, plan), return both the Stripe Price ID and resolved metadata. */
export function resolveRitualSelection(
  size: '10' | '25',
  plan: 'onetime' | 'subscription',
): { stripePriceId: string; line: PriceIdResolution } | null {
  const key = `${size}-${plan}` as RitualKey;
  const stripePriceId = RITUAL_PRICE_IDS[key];
  if (!stripePriceId) return null;
  return { stripePriceId, line: RITUAL_LINES[key] };
}
