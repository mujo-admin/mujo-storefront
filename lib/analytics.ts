/**
 * Mujo analytics — the single announcer.
 *
 * Application code calls `track()`. Nothing else pushes to `dataLayer` and
 * nothing else calls `fbq` directly. One call fans out to:
 *
 *   1. `dataLayer`  → Google Tag Manager → GA4 (and any future tag)
 *   2. Meta Pixel   → browser-side event
 *   3. `/api/meta/convert` → Meta Conversions API (server mirror)
 *
 * (2) and (3) share an `event_id` so Meta counts one event, not two.
 *
 * The contract lives in `docs/measurement-plan.md`. Change that first.
 */

import { trackPixelEvent, generateEventId } from "lib/meta-pixel";

/** GA4 ecommerce item. The only item shape in the codebase. */
export type AnalyticsItem = {
  /** Stripe Price ID (price_…) — the cart's primary key. */
  item_id: string;
  item_name: string;
  item_variant?: string;
  /** Major units (dollars), not cents. */
  price: number;
  quantity: number;
};

export type TrackParams = {
  items?: AnalyticsItem[];
  value?: number;
  currency?: string;
  /** Passed straight through to GA4 and Meta custom_data. */
  [key: string]: unknown;
};

/**
 * Per-event routing.
 *
 * `meta`   — Meta event name, or null when the event is GA4-only.
 * `mirror` — whether the *browser* should also POST to /api/meta/convert.
 *            false for events a server already sends to CAPI; mirroring those
 *            from here would send the same action twice from two origins.
 */
const EVENTS = {
  page_view: { meta: "PageView", mirror: false },
  view_item: { meta: "ViewContent", mirror: true },
  view_item_list: { meta: null, mirror: false },
  add_to_cart: { meta: "AddToCart", mirror: true },
  view_cart: { meta: null, mirror: false },
  // /api/checkout already sends InitiateCheckout server-side.
  begin_checkout: { meta: "InitiateCheckout", mirror: false },
  // The Stripe webhook already sends Purchase server-side.
  purchase: { meta: "Purchase", mirror: false },
  sign_up: { meta: "Lead", mirror: true },
  generate_lead: { meta: "Lead", mirror: true },
} as const;

export type MujoEventName = keyof typeof EVENTS;

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
  }
}

function pushToDataLayer(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);
}

/** Derive Meta's content parameters from the GA4 item shape. */
function toMetaParams(params: TrackParams): Record<string, unknown> {
  const { items, value, currency, ...rest } = params;
  const out: Record<string, unknown> = { ...rest };
  if (typeof value === "number") out.value = value;
  out.currency = currency ?? "USD";
  if (items?.length) {
    out.content_type = "product";
    out.content_ids = items.map((i) => i.item_id);
    out.contents = items.map((i) => ({
      id: i.item_id,
      quantity: i.quantity,
      item_price: i.price,
    }));
    out.num_items = items.reduce((s, i) => s + i.quantity, 0);
  }
  return out;
}

export type TrackOptions = {
  /**
   * Reuse a server-generated event id (purchase, begin_checkout) so the pixel
   * pairs with the CAPI call the server already made. Omit to generate one.
   */
  eventId?: string;
  /** Hashed server-side for Meta match quality. Never reaches dataLayer. */
  email?: string;
};

/**
 * Report one customer action to every configured destination.
 *
 * Safe to call from anywhere client-side — no-ops during SSR, and silently
 * skips destinations that aren't configured.
 */
export function track(
  name: MujoEventName,
  params: TrackParams = {},
  options: TrackOptions = {},
): void {
  if (typeof window === "undefined") return;

  const config = EVENTS[name];
  const eventId = options.eventId ?? generateEventId();

  // 1. GTM / GA4. `email` is deliberately excluded.
  pushToDataLayer({ event: name, event_id: eventId, ...params });

  if (!config.meta) return;
  const metaParams = toMetaParams(params);

  // 2. Browser pixel.
  trackPixelEvent(config.meta, metaParams, eventId);

  // 3. Server mirror — only for events no server already reports.
  if (!config.mirror) return;
  void fetch("/api/meta/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventName: config.meta,
      eventId,
      eventSourceUrl: window.location.href,
      userData: {
        email: options.email,
        fbc: readCookie("_fbc"),
        fbp: readCookie("_fbp"),
      },
      customData: metaParams,
    }),
  }).catch(() => {
    // Tracking must never break the page. The browser pixel already fired.
  });
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const hit = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined;
}

/** Build the canonical item shape from a cart line. */
export function itemFromCartLine(line: {
  stripePriceId: string;
  productTitle: string;
  variantTitle: string;
  unitAmountCents: number;
  quantity: number;
}): AnalyticsItem {
  return {
    item_id: line.stripePriceId,
    item_name: line.productTitle,
    item_variant: line.variantTitle,
    price: line.unitAmountCents / 100,
    quantity: line.quantity,
  };
}

/** Sum of a set of items, in major units — the `value` every event wants. */
export function itemsValue(items: AnalyticsItem[]): number {
  return Number(
    items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2),
  );
}
