/**
 * Klaviyo — the event shape, and the browser calls that send it.
 *
 * Two halves:
 *   - Pure builders (`klaviyoItems`, `klaviyoCartProps`, …) used by both the
 *     browser (`lib/analytics.ts`) and the server (`lib/klaviyo.ts`), so an
 *     email template reads the same field names whichever side sent the event.
 *   - Browser senders (`klaviyoTrack`, `klaviyoIdentify`) that queue onto
 *     klaviyo.js. Safe before the script has loaded and during SSR.
 *
 * Application code does not call the senders directly. It calls `track()` and
 * `identify()` from `lib/analytics.ts`. See `docs/measurement-plan.md`.
 */

import { PRODUCTS, defaultImage, slugForCatalogId } from "lib/product-identity";

/** Structural copy of `AnalyticsItem` (avoids a circular import). */
type Item = {
  item_id: string;
  item_name: string;
  item_variant?: string;
  purchase_type?: string;
  price_id?: string;
  price: number;
  quantity: number;
};

const round2 = (n: number) => Number(n.toFixed(2));

function productUrl(origin: string, catalogId: string): string {
  const slug = slugForCatalogId(catalogId);
  const route = slug ? PRODUCTS[slug]?.route : null;
  return `${origin}${route ?? "/shop"}`;
}

function productImage(origin: string, catalogId: string): string {
  const slug = slugForCatalogId(catalogId);
  const path = slug ? defaultImage(slug) : "";
  return path ? `${origin}${path}` : "";
}

/** `Items[]` as every Mujo Klaviyo event carries it. */
export function klaviyoItems(items: Item[], origin: string) {
  return items.map((i) => ({
    ProductID: i.item_id,
    ProductName: i.item_name,
    Variant: i.item_variant ?? "",
    Quantity: i.quantity,
    ItemPrice: i.price,
    RowTotal: round2(i.price * i.quantity),
    ProductURL: productUrl(origin, i.item_id),
    ImageURL: productImage(origin, i.item_id),
    PurchaseType: i.purchase_type ?? "onetime",
  }));
}

/** "subscription" if anything in the cart renews, else "onetime". */
export function cartPurchaseType(items: Item[]): "subscription" | "onetime" {
  return items.some((i) => i.purchase_type === "subscription")
    ? "subscription"
    : "onetime";
}

/** Properties shared by every cart-shaped event (cart, checkout, order). */
export function klaviyoCartProps(
  items: Item[],
  origin: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const value = round2(items.reduce((s, i) => s + i.price * i.quantity, 0));
  return {
    $value: value,
    Currency: "USD",
    ItemNames: Array.from(new Set(items.map((i) => i.item_name))),
    Items: klaviyoItems(items, origin),
    ItemCount: items.reduce((s, i) => s + i.quantity, 0),
    PurchaseType: cartPurchaseType(items),
    ...extra,
  };
}

/** "Viewed Product" properties. `Name` is kept for templates built on the old
 *  Shopify-era event, which used that key. */
export function klaviyoViewedProductProps(item: Item, origin: string) {
  return {
    ProductName: item.item_name,
    Name: item.item_name,
    ProductID: item.item_id,
    URL: productUrl(origin, item.item_id),
    ImageURL: productImage(origin, item.item_id),
    Price: item.price,
    Brand: "Mujo",
    $value: item.price,
  };
}

/** "Added to Cart": the line just added, plus the whole cart and a link back. */
export function klaviyoAddedToCartProps(
  added: Item,
  cart: Item[],
  origin: string,
  checkoutUrl: string,
) {
  return klaviyoCartProps(cart, origin, {
    AddedItemProductName: added.item_name,
    AddedItemProductID: added.item_id,
    AddedItemVariant: added.item_variant ?? "",
    AddedItemPrice: added.price,
    AddedItemQuantity: added.quantity,
    AddedItemImageURL: productImage(origin, added.item_id),
    AddedItemURL: productUrl(origin, added.item_id),
    CheckoutURL: checkoutUrl,
  });
}

// --- Browser senders ---------------------------------------------------------

declare global {
  interface Window {
    _klOnsite?: unknown[];
  }
}

/** True when the visitor chose "No thanks" on the cookie bar. */
export function trackingDeclined(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem("mujo_consent") === "denied";
  } catch {
    return false; // Private mode: no stored choice, defaults stand.
  }
}

/**
 * Queue a klaviyo.js call. `_klOnsite` is Klaviyo's documented queue: before
 * the script loads it is a plain array that klaviyo.js drains on arrival;
 * afterwards its `push` runs the call immediately. The trailing callback is
 * part of the queue's contract.
 */
function klaviyoQueue(method: string, ...args: unknown[]): void {
  if (typeof window === "undefined") return;
  if (!process.env.NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY) return;
  if (trackingDeclined()) return;
  try {
    window._klOnsite = window._klOnsite || [];
    window._klOnsite.push([method, ...args, () => {}]);
  } catch {
    // Tracking must never break the page.
  }
}

export function klaviyoTrack(
  metric: string,
  properties: Record<string, unknown>,
): void {
  klaviyoQueue("track", metric, properties);
}

/** Tell klaviyo.js who this browser is. Klaviyo records on-site events only
 *  for visitors it can tie to a profile, so this is what switches them on. */
export function klaviyoIdentify(
  email: string,
  properties: Record<string, string> = {},
): void {
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes("@")) return;
  klaviyoQueue("identify", { email: clean, ...properties });
}

/** Feeds Klaviyo's "recently viewed" product blocks. */
export function klaviyoViewedItem(item: Item, origin: string): void {
  klaviyoQueue("trackViewedItem", {
    Title: item.item_name,
    ItemId: item.item_id,
    ImageUrl: productImage(origin, item.item_id),
    Url: productUrl(origin, item.item_id),
    Metadata: { Brand: "Mujo", Price: item.price },
  });
}
