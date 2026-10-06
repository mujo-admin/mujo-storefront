/**
 * Attribution — remembers how a visitor arrived, so a sale can be credited.
 *
 * On landing, the ad and campaign parameters in the URL are saved to a
 * first-party cookie (`mujo_attr`). At checkout the server reads that cookie
 * and stores the values on the Stripe session, which is how a purchase
 * reported by the server days later still carries the original ad click.
 *
 * Last non-direct touch wins: a visit with no parameters never overwrites an
 * earlier one that had them. Works on server and client.
 */

export const ATTRIBUTION_COOKIE = "mujo_attr";
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;
const MAX_VALUE_LENGTH = 150;

const PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "fbclid",
  "gbraid",
  "wbraid",
] as const;

/** Browser only. Call once per landing, before the first page_view. */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem("mujo_consent") === "denied") return;
  } catch {
    // Private mode: no stored choice, defaults stand.
  }

  const search = new URLSearchParams(window.location.search);
  const found: Record<string, string> = {};
  for (const key of PARAMS) {
    const value = search.get(key);
    if (value) found[key] = value.slice(0, MAX_VALUE_LENGTH);
  }
  if (Object.keys(found).length === 0) return;

  found.landing_page = window.location.pathname.slice(0, MAX_VALUE_LENGTH);
  found.ts = String(Date.now());

  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${ATTRIBUTION_COOKIE}=${encodeURIComponent(JSON.stringify(found))}` +
    `; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

/** Decode the cookie into a flat record. Empty on anything malformed. */
export function parseAttributionCookie(
  value: string | null | undefined,
): Record<string, string> {
  if (!value) return {};
  try {
    let raw = value;
    try {
      raw = decodeURIComponent(value);
    } catch {
      // Already decoded by the cookie reader.
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v) out[k] = v.slice(0, MAX_VALUE_LENGTH);
    }
    return out;
  } catch {
    return {};
  }
}
