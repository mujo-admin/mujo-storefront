// Stripe object IDs created by scripts/mirror-shopify-to-stripe.ts and other
// one-time setup scripts. Populated via env vars so test/staging/live can each
// hold a different set of IDs without code changes.
//
// Mirror script writes the shipping rate IDs to .env.local on first run.

export const SHIPPING_RATE_FREE_ID = process.env.STRIPE_SHIPPING_FREE_ID ?? '';
export const SHIPPING_RATE_FLAT_ID = process.env.STRIPE_SHIPPING_FLAT_ID ?? '';

export const FREE_SHIPPING_THRESHOLD_CENTS = 10000;

// Ritual Stripe Price IDs — populated by scripts/fetch-ritual-price-ids.mjs.
// Mirrored to NEXT_PUBLIC_* for client-side consumption by the PDP buy box.
// Price IDs are not secret (they're posted to /api/checkout from the browser).
//
// The 10-serving bag is one-time only (no subscription Price). Smaller bag,
// higher unit cost — never carries the MUJO_SUB_15 discount.
//
// The 25-serving subscription has TWO cadences (Subscription v2): the primary
// 4-week Price (`25-subscription`) and the 8-week Price (`25-subscription-8wk`).
// Both list at $65 and take the flat 15% MUJO_SUB_15 coupon at checkout; the
// customer picks quantity (1 / 2 bags) + cadence on the PDP.
export const RITUAL_PRICE_IDS = {
  '10-onetime': process.env.NEXT_PUBLIC_RITUAL_PRICE_10_ONETIME ?? '',
  '25-onetime': process.env.NEXT_PUBLIC_RITUAL_PRICE_25_ONETIME ?? '',
  '25-subscription': process.env.NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION ?? '', // every 4 weeks (primary)
  '25-subscription-8wk':
    process.env.NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION_8W ?? '', // every 8 weeks
} as const;

export type RitualSize = '10' | '25';
export type RitualPlan = 'onetime' | 'subscription';
/** Subscription cadence selectable on the Ritual PDP. */
export type RitualCadence = '4wk' | '8wk';

// ISO 3166-1 alpha-2 country codes accepted by Stripe Checkout shipping_address_collection.
// US-only per project_us_only_shipping memory. Expand as Mujo opens new ship-to regions.
export const SUPPORTED_COUNTRIES = ['US'] as const;

// Stripe Coupon applied to all subscription checkouts. The PDP advertises
// "Subscribe & save 15%" — the per-Price values in Stripe are full retail,
// so the discount is applied at checkout time via this coupon.
export const SUBSCRIPTION_COUPON_ID =
  process.env.STRIPE_SUBSCRIPTION_COUPON_ID ?? '';

// First-order subscriber gift (Subscription v2): a free rechargeable milk
// frother ships with the FIRST subscription order only (billing_reason
// subscription_create). Added as a $0 line to the Shopify order in the
// invoice.paid webhook handler — never charged via Stripe, never on renewals.
// Toggle so the offer can be switched off without a deploy. The variant GID is
// Mujo's single frother product's default variant (resolve once, set in env).
export const FIRST_ORDER_FROTHER_GIFT_ENABLED =
  process.env.FIRST_ORDER_FROTHER_GIFT_ENABLED === 'true';
export const FROTHER_GIFT_VARIANT_GID =
  process.env.FROTHER_GIFT_VARIANT_GID ?? '';

// Merch Stripe Price IDs — populated by scripts/mirror-shopify-to-stripe.ts.
// Keys follow `{handle}_{color?}_{size?}` lowercased; `frother` is single-variant.
// Crew is asymmetric — Bone has no XS variant per Shopify; that combo is absent
// by design (not a missing env var). All merch Prices are one-time only.
export const MERCH_PRICE_IDS = {
  frother: process.env.NEXT_PUBLIC_MERCH_FROTHER ?? '',
  hat_white: process.env.NEXT_PUBLIC_MERCH_HAT_WHITE ?? '',
  hat_stone: process.env.NEXT_PUBLIC_MERCH_HAT_STONE ?? '',
  tee_desert_s: process.env.NEXT_PUBLIC_MERCH_TEE_DESERT_S ?? '',
  tee_desert_m: process.env.NEXT_PUBLIC_MERCH_TEE_DESERT_M ?? '',
  tee_desert_l: process.env.NEXT_PUBLIC_MERCH_TEE_DESERT_L ?? '',
  tee_desert_xl: process.env.NEXT_PUBLIC_MERCH_TEE_DESERT_XL ?? '',
  tee_white_s: process.env.NEXT_PUBLIC_MERCH_TEE_WHITE_S ?? '',
  tee_white_m: process.env.NEXT_PUBLIC_MERCH_TEE_WHITE_M ?? '',
  tee_white_l: process.env.NEXT_PUBLIC_MERCH_TEE_WHITE_L ?? '',
  tee_white_xl: process.env.NEXT_PUBLIC_MERCH_TEE_WHITE_XL ?? '',
  crew_bone_s: process.env.NEXT_PUBLIC_MERCH_CREW_BONE_S ?? '',
  crew_bone_m: process.env.NEXT_PUBLIC_MERCH_CREW_BONE_M ?? '',
  crew_bone_l: process.env.NEXT_PUBLIC_MERCH_CREW_BONE_L ?? '',
  crew_bone_xl: process.env.NEXT_PUBLIC_MERCH_CREW_BONE_XL ?? '',
  crew_sandstone_xs: process.env.NEXT_PUBLIC_MERCH_CREW_SANDSTONE_XS ?? '',
  crew_sandstone_s: process.env.NEXT_PUBLIC_MERCH_CREW_SANDSTONE_S ?? '',
  crew_sandstone_m: process.env.NEXT_PUBLIC_MERCH_CREW_SANDSTONE_M ?? '',
  crew_sandstone_l: process.env.NEXT_PUBLIC_MERCH_CREW_SANDSTONE_L ?? '',
  crew_sandstone_xl: process.env.NEXT_PUBLIC_MERCH_CREW_SANDSTONE_XL ?? '',
} as const;

export type MerchPriceKey = keyof typeof MERCH_PRICE_IDS;
