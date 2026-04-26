// Stripe object IDs created by scripts/mirror-shopify-to-stripe.ts and other
// one-time setup scripts. Populated via env vars so test/staging/live can each
// hold a different set of IDs without code changes.
//
// Mirror script writes the shipping rate IDs to .env.local on first run.

export const SHIPPING_RATE_FREE_ID = process.env.STRIPE_SHIPPING_FREE_ID ?? '';
export const SHIPPING_RATE_FLAT_ID = process.env.STRIPE_SHIPPING_FLAT_ID ?? '';

export const FREE_SHIPPING_THRESHOLD_CENTS = 5000;

// ISO 3166-1 alpha-2 country codes accepted by Stripe Checkout shipping_address_collection.
// Expand as Mujo opens new ship-to regions.
export const SUPPORTED_COUNTRIES = ['US', 'CA'] as const;
