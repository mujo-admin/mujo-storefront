// Cart shape for the Mujo on-site cart. Keyed off Stripe Price IDs because
// that is the canonical product identity post-W2 (Stripe is the system of
// record for prices; Shopify mirrors product copy + media). The browser
// cart only stores enough to render the drawer + checkout summary; server
// re-fetches Stripe Prices at /api/payment-intent time so a stale localStorage
// cart cannot override what the customer pays.

export type CartLineItem = {
  /** Stripe Price ID (price_…). The cart's primary key — one line per Price. */
  stripePriceId: string;
  /** Shopify product handle for the /products/<handle> link in the drawer. */
  productHandle: string;
  productTitle: string;
  /** e.g. "25 servings · Subscribe & save". Display-only. */
  variantTitle: string;
  image: { url: string; alt: string };
  /** Display-only; server fetches authoritative amount from Stripe Price. */
  unitAmountCents: number;
  currency: 'usd';
  /** True iff the underlying Stripe Price is recurring. Determines mode at checkout. */
  isSubscription: boolean;
  /** Capped at MAX_QUANTITY_PER_LINE per Stripe's line_items.quantity.max. */
  quantity: number;
};

export type Cart = {
  items: CartLineItem[];
  /** ISO timestamp of last mutation. Used by Phase 4 cart-merge tie-breaks. */
  updatedAt: string;
};

export const EMPTY_CART: Cart = {
  items: [],
  updatedAt: new Date(0).toISOString(),
};

export const MAX_QUANTITY_PER_LINE = 50;

/** Cart-shape sentinel for localStorage versioning. Bump on breaking changes. */
export const CART_STORAGE_VERSION = 1;
export const CART_STORAGE_KEY = 'mujo_cart';
