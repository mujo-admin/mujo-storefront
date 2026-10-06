/**
 * Mujo analytics — the single announcer.
 *
 * Application code calls `track()`. Nothing else pushes to `dataLayer` and
 * nothing else calls `fbq` directly. One call fans out to:
 *
 *   1. `dataLayer`  → Google Tag Manager (available to any future tag), and
 *      `gtag('event')` → GA4 directly
 *   2. Meta Pixel   → browser-side event
 *   3. `/api/meta/convert` → Meta Conversions API (server mirror)
 *   4. klaviyo.js   → Klaviyo (product views, carts and checkouts only)
 *
 * (2) and (3) share an `event_id` so Meta counts one event, not two.
 *
 * The contract lives in `docs/measurement-plan.md`. Change that first.
 */

import { trackPixelEvent, generateEventId } from "lib/meta-pixel";
import {
  catalogIdForSlug,
  identifyPrice,
  type PurchaseType,
} from "lib/product-identity";
import {
  cartPurchaseType,
  klaviyoAddedToCartProps,
  klaviyoCartProps,
  klaviyoIdentify,
  klaviyoTrack,
  klaviyoViewedItem,
  klaviyoViewedProductProps,
} from "lib/klaviyo-onsite";

export { cartPurchaseType };

/** GA4 ecommerce item. The only item shape in the codebase. */
export type AnalyticsItem = {
  /** Catalog ID = Shopify handle. Matches the product feed `g:id`. */
  item_id: string;
  item_name: string;
  item_variant?: string;
  /** "subscription" | "onetime". */
  purchase_type?: PurchaseType;
  /** Stripe Price ID. Secondary; never use as the product key. */
  price_id?: string;
  /** Major units (dollars), not cents. */
  price: number;
  quantity: number;
  /** Position in a list (`view_item_list`, `select_item`). */
  index?: number;
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
 * `meta`    — Meta event name, or null when the event is not sent to Meta.
 * `klaviyo` — Klaviyo metric name, or null. Names match Klaviyo's own
 *             templates exactly, so its stock flows can be pointed at them.
 * `mirror` — whether the *browser* should also POST to /api/meta/convert.
 *            false for events a server already sends to CAPI; mirroring those
 *            from here would send the same action twice from two origins.
 */
const EVENTS = {
  page_view: { meta: "PageView", mirror: false, klaviyo: null },
  view_item: { meta: "ViewContent", mirror: true, klaviyo: "Viewed Product" },
  view_item_list: { meta: null, mirror: false, klaviyo: null },
  select_item: { meta: null, mirror: false, klaviyo: null },
  add_to_cart: { meta: "AddToCart", mirror: true, klaviyo: "Added to Cart" },
  remove_from_cart: { meta: null, mirror: false, klaviyo: null },
  view_cart: { meta: null, mirror: false, klaviyo: null },
  // /api/checkout-session already sends InitiateCheckout server-side.
  begin_checkout: {
    meta: "InitiateCheckout",
    mirror: false,
    klaviyo: "Started Checkout",
  },
  // The Stripe webhook already sends Purchase to Meta and "Order Placed" to
  // Klaviyo server-side.
  purchase: { meta: "Purchase", mirror: false, klaviyo: null },
  sign_up: { meta: "Lead", mirror: true, klaviyo: null },
  generate_lead: { meta: "Lead", mirror: true, klaviyo: null },
} as const;

export type MujoEventName = keyof typeof EVENTS;

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    gtag?: (...args: unknown[]) => void;
  }
}

/** Keys cleared on each push unless the event sets them. */
const DATALAYER_RESET: Record<string, undefined> = {
  items: undefined,
  value: undefined,
  currency: undefined,
  transaction_id: undefined,
  purchase_type: undefined,
  item_list_name: undefined,
  method: undefined,
  tax: undefined,
  shipping: undefined,
};

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
  /**
   * The whole cart after this action. Klaviyo's "Added to Cart" and "Started
   * Checkout" carry it so an email can show everything, not just one line.
   */
  cart?: AnalyticsItem[];
  /** Link that rebuilds the cart (see lib/cart/restore.ts). Klaviyo only. */
  checkoutUrl?: string;
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

  // 1. GTM / GA4. `email` is deliberately excluded. dataLayer values persist
  // between pushes, so the ecommerce keys are reset on every event: without
  // this, a page_view after a product view would still carry that product.
  pushToDataLayer({
    ...DATALAYER_RESET,
    event: name,
    event_id: eventId,
    ...params,
  });

  sendToGa4(name, eventId, params);

  // 4. Klaviyo. Independent of Meta, so it runs before the Meta early-return.
  if (config.klaviyo) sendToKlaviyo(name, params, options, eventId);

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

/**
 * GA4, directly. A plain `dataLayer.push({ event })` reaches GA4 only if the
 * GTM container has a tag that forwards it, and ours holds just the Google tag
 * (checked 2026-10-06: GA4 had been receiving page views and nothing else).
 * `gtag('event', …, { send_to })` goes straight to the property, so reporting
 * a sale never depends on container setup. Do NOT also add GA4 event tags for
 * these events in GTM, or each would be counted twice.
 *
 * `page_view` is skipped: GA4's own enhanced measurement already sends one on
 * every load and every in-site navigation.
 */
function sendToGa4(
  name: MujoEventName,
  eventId: string,
  params: TrackParams,
): void {
  const ga4Id = process.env.NEXT_PUBLIC_GA4_ID;
  if (!ga4Id || name === "page_view") return;
  if (typeof window.gtag !== "function") return;
  window.gtag("event", name, { ...params, event_id: eventId, send_to: ga4Id });
}

function sendToKlaviyo(
  name: MujoEventName,
  params: TrackParams,
  options: TrackOptions,
  eventId: string,
): void {
  const items = params.items ?? [];
  const first = items[0];
  if (!first) return;
  const origin = window.location.origin;

  if (name === "view_item") {
    klaviyoTrack("Viewed Product", klaviyoViewedProductProps(first, origin));
    klaviyoViewedItem(first, origin);
    return;
  }
  const cart = options.cart?.length ? options.cart : items;
  const checkoutUrl = options.checkoutUrl ?? `${origin}/shop`;
  if (name === "add_to_cart") {
    klaviyoTrack(
      "Added to Cart",
      klaviyoAddedToCartProps(first, cart, origin, checkoutUrl),
    );
    return;
  }
  if (name === "begin_checkout") {
    klaviyoTrack(
      "Started Checkout",
      klaviyoCartProps(cart, origin, {
        CheckoutURL: checkoutUrl,
        $event_id: eventId,
      }),
    );
  }
}

/**
 * Tell Klaviyo who this browser belongs to. Call after any moment the visitor
 * gives an email: a sign-up, a login, a purchase. Never reaches GA4 or Meta.
 */
export function identify(
  email: string | null | undefined,
  properties: Record<string, string> = {},
): void {
  if (!email) return;
  klaviyoIdentify(email, properties);
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
  productHandle?: string;
  productTitle: string;
  variantTitle: string;
  unitAmountCents: number;
  isSubscription?: boolean;
  quantity: number;
}): AnalyticsItem {
  const identity = identifyPrice(line.stripePriceId);
  return {
    item_id:
      identity?.id ??
      (line.productHandle ? catalogIdForSlug(line.productHandle) : null) ??
      line.productHandle ??
      line.stripePriceId,
    item_name: identity?.name ?? line.productTitle,
    item_variant: line.variantTitle,
    purchase_type:
      identity?.purchaseType ??
      (line.isSubscription ? "subscription" : "onetime"),
    price_id: line.stripePriceId,
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
