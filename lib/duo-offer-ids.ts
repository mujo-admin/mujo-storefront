// Names shared between Stripe, the checkout and the Shopify order builder for
// the Black Friday 2026 Daily Ritual Duo. No imports, so the order builder
// stays free of env reads. Rules and dates: lib/duo-offer.ts.

/** $16 off once: the one-time pair costs $89 instead of $105. */
export const DUO_ONETIME_COUPON_ID = "DAILY_RITUAL_DUO";
/** $21 off the first delivery: subscribing to both starts at $69, then $90. */
export const DUO_SUBSCRIPTION_COUPON_ID = "DAILY_RITUAL_DUO_SUBSCRIBE";
/** Shopify tag on every order placed with either duo discount. */
export const DUO_ORDER_TAG = "black-friday-duo-2026";
