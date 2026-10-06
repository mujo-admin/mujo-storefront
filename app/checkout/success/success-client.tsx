"use client";

import { useEffect, useRef } from "react";
import { useCart } from "components/cart/cart-context";
import {
  track,
  identify,
  cartPurchaseType,
  type AnalyticsItem,
} from "lib/analytics";
import { clearLocalStorage, makeEmptyCart } from "lib/cart/store";

type Props = {
  eventId: string | null;
  sessionId: string;
  amount: number;
  currency: string;
  email: string | null;
  items: AnalyticsItem[];
  /** Dollars. */
  tax: number;
  shipping: number;
};

/**
 * Client-side fires for the success page:
 *  1. Klaviyo "Order Confirmation Viewed" custom event (separate from
 *     "Order Placed" which fires server-side via webhook handler).
 *  2. Meta Pixel "Purchase" event (uses same eventId as the CAPI fire from
 *     the webhook for dedup).
 *  3. Clear cart — they just bought it.
 */
export function CheckoutSuccessClient({
  eventId,
  sessionId,
  amount,
  currency,
  email,
  items,
  tax,
  shipping,
}: Props) {
  const { setCart } = useCart();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // purchase — the Stripe webhook already sent Purchase to Meta's CAPI with
    // this eventId, so this pairs with it (Meta counts one) and additionally
    // reports the sale to GA4, which previously saw no revenue at all.
    track(
      "purchase",
      {
        transaction_id: sessionId,
        value: amount / 100,
        currency: currency.toUpperCase(),
        tax,
        shipping,
        items,
        purchase_type: cartPurchaseType(items),
      },
      { eventId: eventId ?? sessionId },
    );

    // A buyer is the best-known visitor there is: tie this browser to their
    // Klaviyo profile so later visits are recognised.
    identify(email);

    // Klaviyo client event — fire-and-forget. The webhook also fires
    // "Order Placed"; this is the *Viewed Confirmation* signal.
    if (email) {
      void fetch("/api/klaviyo/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          metric: "Order Confirmation Viewed",
          properties: {
            CheckoutSessionId: sessionId,
            Value: amount / 100,
            Currency: currency,
          },
        }),
      }).catch(() => {
        // log-only path; not blocking
      });
    }

    // Empty the local cart — the order is placed.
    setCart(makeEmptyCart());
    clearLocalStorage();
  }, [
    eventId,
    sessionId,
    amount,
    currency,
    email,
    items,
    tax,
    shipping,
    setCart,
  ]);

  return null;
}
