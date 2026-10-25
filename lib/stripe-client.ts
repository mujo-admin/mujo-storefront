import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

let stripePromiseSingleton: Promise<StripeJs | null> | null = null;

/**
 * One Stripe.js load per page session. Called early on purpose: when the cart
 * drawer opens (components/cart/cart-drawer.tsx) and as soon as /checkout
 * mounts, so Stripe's ~1.7 s (on a phone) script download runs alongside
 * our /api/checkout-session call instead of after it.
 */
export function getStripePromise(): Promise<StripeJs | null> {
  if (!stripePromiseSingleton) {
    if (!PUBLISHABLE_KEY) {
      console.error(
        "[checkout] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set; <EmbeddedCheckout> will fail.",
      );
      stripePromiseSingleton = Promise.resolve(null);
    } else {
      stripePromiseSingleton = loadStripe(PUBLISHABLE_KEY);
    }
  }
  return stripePromiseSingleton;
}
