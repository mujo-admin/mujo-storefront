"use client";

import { useEffect, useRef } from "react";
import { useCart } from "components/cart/cart-context";
import { trackPixelEvent } from "lib/meta-pixel";
import { clearLocalStorage, makeEmptyCart } from "lib/cart/store";

type Props = {
  eventId: string | null;
  sessionId: string;
  amount: number;
  currency: string;
  email: string | null;
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
}: Props) {
  const { setCart } = useCart();
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    // Pixel event (Meta) — dedup with CAPI via eventId.
    trackPixelEvent(
      "Purchase",
      { currency, value: amount / 100 },
      eventId ?? sessionId,
    );

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
  }, [eventId, sessionId, amount, currency, email, setCart]);

  return null;
}
