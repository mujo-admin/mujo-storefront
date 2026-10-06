/**
 * Server-side analytics helpers.
 *
 * The browser reports through `lib/analytics.ts`. The server reports the events
 * a browser cannot be trusted to deliver: the start of a checkout, a paid
 * order, an abandoned checkout. This module keeps both sides speaking the same
 * product language (`lib/product-identity.ts`) and carries the shopper's ad
 * click from the browser, through Stripe metadata, to the purchase event.
 *
 * See `docs/measurement-plan.md`, "Attribution".
 */

import type { NextRequest } from "next/server";
import type { AnalyticsItem } from "lib/analytics";
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from "lib/attribution";
import { identifyPrice } from "lib/product-identity";

export const SITE_ORIGIN = "https://mujoworld.com";

// --- Items -------------------------------------------------------------------

export type PriceLine = {
  priceId: string;
  quantity: number;
  /** What Stripe charged for the whole line, before tax. Optional. */
  amountCents?: number | null;
};

/**
 * Stripe lines → analytics items. Unknown Prices and the free first-order
 * frother are dropped: a gift is not a purchased product.
 */
export function itemsFromPriceIds(lines: PriceLine[]): AnalyticsItem[] {
  const out: AnalyticsItem[] = [];
  for (const line of lines) {
    const identity = identifyPrice(line.priceId);
    if (!identity) continue;
    const quantity = Math.max(1, line.quantity || 1);
    const price =
      typeof line.amountCents === "number" && line.amountCents > 0
        ? Number((line.amountCents / quantity / 100).toFixed(2))
        : identity.unitPrice;
    out.push({
      item_id: identity.id,
      item_name: identity.name,
      item_variant: identity.variantTitle,
      purchase_type: identity.purchaseType,
      price_id: line.priceId,
      price,
      quantity,
    });
  }
  return out;
}

export function itemsValue(items: AnalyticsItem[]): number {
  return Number(
    items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2),
  );
}

/** Meta `custom_data`. `content_ids` are catalog IDs, so the catalog matches. */
export function metaCustomData(
  items: AnalyticsItem[],
  valueDollars: number,
  currency = "USD",
): Record<string, unknown> {
  return {
    content_type: "product",
    content_ids: Array.from(new Set(items.map((i) => i.item_id))),
    contents: items.map((i) => ({
      id: i.item_id,
      quantity: i.quantity,
      item_price: i.price,
    })),
    num_items: items.reduce((s, i) => s + i.quantity, 0),
    value: valueDollars,
    currency: currency.toUpperCase(),
  };
}

// --- Attribution -------------------------------------------------------------

/** Stripe metadata allows 500 characters per value. */
const META_VALUE_MAX = 480;
const ATTR_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid",
  "gbraid",
  "wbraid",
  "landing_page",
] as const;

/** `_ga` cookie → GA4 client id (`GA1.1.1234.5678` → `1234.5678`). */
function gaClientId(cookie: string | undefined): string | undefined {
  if (!cookie) return undefined;
  const parts = cookie.split(".");
  if (parts.length < 4) return undefined;
  return parts.slice(-2).join(".");
}

/** `_ga_<stream>` cookie → GA4 session id. Handles both cookie formats:
 *  `GS1.1.<session>.…` and `GS2.1.s<session>$o1$…`. */
function gaSessionId(cookie: string | undefined): string | undefined {
  if (!cookie) return undefined;
  const gs2 = cookie.match(/^GS2\.\d+\.s(\d+)/);
  if (gs2) return gs2[1];
  const gs1 = cookie.match(/^GS1\.\d+\.(\d+)/);
  if (gs1) return gs1[1];
  return undefined;
}

/**
 * Read everything that ties this checkout to how the shopper arrived. Returned
 * flat and string-valued, ready to spread into Stripe metadata (under 20 keys).
 */
export function readAttribution(req: NextRequest): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (key: string, value: string | undefined | null) => {
    if (value) out[key] = value.slice(0, META_VALUE_MAX);
  };
  const cookie = (name: string) => req.cookies.get(name)?.value;

  const attr = parseAttributionCookie(cookie(ATTRIBUTION_COOKIE));

  put("fbp", cookie("_fbp"));
  // Meta sets _fbc itself when it sees fbclid. If the pixel had not run yet,
  // build the same value from the click id we saved on landing.
  put(
    "fbc",
    cookie("_fbc") ??
      (attr.fbclid
        ? `fb.1.${attr.ts ?? Date.now()}.${attr.fbclid}`
        : undefined),
  );

  put("ga_client_id", gaClientId(cookie("_ga")));
  const streamSuffix = process.env.NEXT_PUBLIC_GA4_ID?.replace(/^G-/, "");
  if (streamSuffix) {
    put("ga_session_id", gaSessionId(cookie(`_ga_${streamSuffix}`)));
  }

  for (const key of ATTR_KEYS) put(`attr_${key}`, attr[key]);

  put("client_ip", req.headers.get("x-forwarded-for")?.split(",")[0]?.trim());
  put("client_ua", req.headers.get("user-agent")?.slice(0, 400));

  return out;
}

export type Attribution = {
  fbp?: string;
  fbc?: string;
  gaClientId?: string;
  gaSessionId?: string;
  clientIp?: string;
  clientUserAgent?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  landingPage?: string;
};

/** Inverse of `readAttribution`: Stripe metadata → attribution. */
export function attributionFromMetadata(
  meta: Record<string, string> | null | undefined,
): Attribution {
  const m = meta ?? {};
  const get = (k: string) => (m[k] ? m[k] : undefined);
  return {
    fbp: get("fbp"),
    fbc: get("fbc"),
    gaClientId: get("ga_client_id"),
    gaSessionId: get("ga_session_id"),
    clientIp: get("client_ip"),
    clientUserAgent: get("client_ua"),
    utmSource: get("attr_utm_source"),
    utmMedium: get("attr_utm_medium"),
    utmCampaign: get("attr_utm_campaign"),
    utmContent: get("attr_utm_content"),
    utmTerm: get("attr_utm_term"),
    gclid: get("attr_gclid"),
    landingPage: get("attr_landing_page"),
  };
}

/** Meta CAPI `userData` for a server event that happens after the visit. */
export function capiUserData(email: string | null | undefined, a: Attribution) {
  return {
    email: email ?? undefined,
    fbp: a.fbp,
    fbc: a.fbc,
    clientIpAddress: a.clientIp,
    clientUserAgent: a.clientUserAgent,
  };
}

/** Channel fields added to Klaviyo "Order Placed", so segments can see them. */
export function klaviyoAttributionProps(
  a: Attribution,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (a.utmSource) out.UTMSource = a.utmSource;
  if (a.utmMedium) out.UTMMedium = a.utmMedium;
  if (a.utmCampaign) out.UTMCampaign = a.utmCampaign;
  if (a.utmContent) out.UTMContent = a.utmContent;
  if (a.landingPage) out.LandingPage = a.landingPage;
  return out;
}
