/**
 * Cart restore link — a URL that rebuilds a cart.
 *
 * Used by the abandonment emails ("your cart is waiting"). The link names
 * products, variants and quantities only:
 *
 *   /cart/restore?i=the-ritual~25-subscription~1,mujo-t-shirt~tee_desert_s~2
 *
 * It is validated, not signed. Prices always come from the current price map
 * and Stripe stays authoritative at checkout, so an edited link can do nothing
 * a shopper could not do by clicking around the shop.
 */

import {
  identifyPrice,
  priceIdForVariant,
  slugForCatalogId,
} from "lib/product-identity";
import { resolvePriceId } from "./price-id-map";
import { MAX_QUANTITY_PER_LINE, type CartLineItem } from "./types";

const MAX_LINES = 20;
const LINE_SEP = ",";
const FIELD_SEP = "~";

/** Path + query (no origin) that rebuilds these lines. Null if none resolve. */
export function buildRestorePath(
  lines: Array<{ stripePriceId: string; quantity: number }>,
): string | null {
  const parts: string[] = [];
  for (const line of lines.slice(0, MAX_LINES)) {
    const identity = identifyPrice(line.stripePriceId);
    // Legacy Prices are no longer sold, so they cannot be restored.
    if (!identity || identity.variantKey.endsWith("-legacy")) continue;
    parts.push(
      [identity.id, identity.variantKey, line.quantity].join(FIELD_SEP),
    );
  }
  if (parts.length === 0) return null;
  return `/cart/restore?i=${parts.map(encodeURIComponent).join(LINE_SEP)}`;
}

export function buildRestoreUrl(
  lines: Array<{ stripePriceId: string; quantity: number }>,
  origin: string,
): string {
  const path = buildRestorePath(lines);
  return path ? `${origin}${path}` : `${origin}/shop`;
}

/** Decode the `i` parameter back into cart lines. Anything that does not
 *  resolve to a product on sale today is dropped without complaint. */
export function parseRestoreParam(
  i: string | null | undefined,
): CartLineItem[] {
  if (!i) return [];
  const out = new Map<string, CartLineItem>();

  for (const raw of i.split(LINE_SEP).slice(0, MAX_LINES)) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      continue;
    }
    const [catalogId, variantKey, qtyRaw] = decoded.split(FIELD_SEP);
    if (!catalogId || !variantKey) continue;

    const slug = slugForCatalogId(catalogId);
    if (!slug) continue;
    const stripePriceId = priceIdForVariant(slug, variantKey);
    if (!stripePriceId) continue;
    const line = resolvePriceId(stripePriceId);
    if (!line) continue;

    const qty = Number.parseInt(qtyRaw ?? "1", 10);
    const quantity = Math.min(
      MAX_QUANTITY_PER_LINE,
      Math.max(1, Number.isFinite(qty) ? qty : 1),
    );

    const existing = out.get(stripePriceId);
    out.set(stripePriceId, {
      stripePriceId,
      ...line,
      quantity: Math.max(existing?.quantity ?? 0, quantity),
    });
  }

  return Array.from(out.values());
}
