/**
 * GA4 Measurement Protocol — server-side purchase.
 *
 * GA4 used to hear about a sale only from the shopper's browser, so every
 * buyer with an ad blocker or strict privacy settings was missing (Nov 2026:
 * GA4 saw 1 of 3 web orders that had no `_ga` cookie at checkout). The Stripe
 * webhook now sends `purchase` here instead, exactly once per order, and the
 * browser no longer sends it to GA4 (see `sendToGa4` in lib/analytics.ts), so
 * nothing is counted twice.
 *
 * When the shopper's `_ga` cookie was saved on the checkout (ga_client_id +
 * ga_session_id in Stripe metadata), the sale joins their visit and keeps its
 * traffic source. Without it, the sale is still counted under a fresh client
 * id, with no source.
 *
 * Env:
 *   NEXT_PUBLIC_GA4_ID   measurement id (G-…), already used by the browser
 *   GA4_API_SECRET       Measurement Protocol API secret ("Website Orders"
 *                        in GA4 Admin → Data streams → Mujo Storefront)
 */

import { randomInt } from "node:crypto";
import type { AnalyticsItem } from "lib/analytics";
import type { Attribution } from "lib/analytics-server";

const ENDPOINT = "https://www.google-analytics.com/mp/collect";

export type Ga4Purchase = {
  /** Same id the browser used to use: the Checkout Session id (or PI id). */
  transactionId: string;
  value: number;
  currency: string;
  tax?: number;
  shipping?: number;
  items: AnalyticsItem[];
  attribution: Attribution;
  /** Matches `purchase_type` on the browser events. */
  purchaseType?: string;
};

/** A client id in GA's own format, for buyers whose `_ga` cookie never arrived. */
function freshClientId(): string {
  return `${randomInt(1_000_000_000, 2_147_483_647)}.${Math.floor(Date.now() / 1000)}`;
}

/** Build the request body. Exported for tests. */
export function ga4PurchaseBody(
  p: Ga4Purchase,
  clientId = p.attribution.gaClientId ?? freshClientId(),
) {
  const sessionId = p.attribution.gaSessionId
    ? Number(p.attribution.gaSessionId) || undefined
    : undefined;
  return {
    client_id: clientId,
    non_personalized_ads: false,
    events: [
      {
        name: "purchase",
        params: {
          transaction_id: p.transactionId,
          value: p.value,
          currency: p.currency,
          ...(typeof p.tax === "number" ? { tax: p.tax } : {}),
          ...(typeof p.shipping === "number" ? { shipping: p.shipping } : {}),
          ...(p.purchaseType ? { purchase_type: p.purchaseType } : {}),
          // session_id + engagement_time_msec put the sale inside the visit
          // (and so under its traffic source) instead of a session of its own.
          ...(sessionId
            ? { session_id: sessionId, engagement_time_msec: 1 }
            : {}),
          server_sent: "true",
          items: p.items.map((i) => ({
            item_id: i.item_id,
            item_name: i.item_name,
            item_variant: i.item_variant,
            price: i.price,
            quantity: i.quantity,
          })),
        },
      },
    ],
  };
}

/**
 * Send one purchase to GA4. Never throws: analytics must not fail an order.
 * Returns true when GA4 accepted the request (MP replies 2xx even for
 * malformed events, so test changes against /debug/mp/collect).
 */
export async function sendGa4Purchase(p: Ga4Purchase): Promise<boolean> {
  const measurementId = process.env.NEXT_PUBLIC_GA4_ID?.trim();
  const apiSecret = process.env.GA4_API_SECRET?.trim();
  if (!measurementId || !apiSecret) {
    console.warn(
      "[ga4] purchase not sent: NEXT_PUBLIC_GA4_ID or GA4_API_SECRET missing",
    );
    return false;
  }
  const url = `${ENDPOINT}?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ga4PurchaseBody(p)),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error("[ga4] purchase rejected", res.status);
    return res.ok;
  } catch (err) {
    console.error("[ga4] purchase failed", err);
    return false;
  }
}
