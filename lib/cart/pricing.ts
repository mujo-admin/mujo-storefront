import { FREE_SHIPPING_THRESHOLD_CENTS } from 'lib/stripe-constants';
import type { Cart } from './types';

/** Flat shipping rate when subtotal is below the free threshold. $5. */
export const FLAT_SHIPPING_CENTS = 500;

export function subtotalCents(cart: Cart): number {
  return cart.items.reduce(
    (sum, item) => sum + item.unitAmountCents * item.quantity,
    0,
  );
}

/**
 * Shipping cost based on subtotal alone. Real shipping is set by Stripe
 * Shipping Rates at checkout — this is for the cart-drawer summary line only.
 */
export function shippingCents(subtotal: number): number {
  if (subtotal <= 0) return 0;
  return subtotal >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : FLAT_SHIPPING_CENTS;
}

/**
 * Subscription-aware shipping for the cart drawer + checkout summary card.
 * Any cart containing a subscription ships free (matches the checkout routes,
 * which pass no shipping_options in subscription mode). Otherwise the $100
 * threshold applies. This is the display source of truth; Stripe still owns
 * the authoritative number at checkout.
 */
export function effectiveShippingCents(cart: Cart): number {
  if (cart.items.some((item) => item.isSubscription)) return 0;
  return shippingCents(subtotalCents(cart));
}

export function freeShippingProgress(subtotal: number): {
  remainingCents: number;
  pct: number;
  unlocked: boolean;
} {
  if (subtotal <= 0) {
    return { remainingCents: FREE_SHIPPING_THRESHOLD_CENTS, pct: 0, unlocked: false };
  }
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD_CENTS - subtotal);
  const pct = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD_CENTS) * 100));
  return { remainingCents: remaining, pct, unlocked: remaining === 0 };
}

export function totalCents(
  subtotal: number,
  shipping: number,
  taxCentsValue: number,
): number {
  return subtotal + shipping + taxCentsValue;
}
