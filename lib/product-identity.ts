/**
 * Product identity — the one place a product gets its tracking ID.
 *
 * A product used to have three IDs: the route slug on the product page
 * (`mujo-ritual`), the Stripe Price ID in the cart and checkout (`price_…`),
 * and the Shopify handle in the product feed (`the-ritual`). Meta could not
 * match on-site events to the catalog and GA4 split one product across rows.
 *
 * Now every event, the feed and Klaviyo use the **Shopify handle** as the
 * product ID. Variant and plan travel as parameters. Stripe Price IDs are
 * secondary and never the product key.
 *
 * Works on server and client (no Node-only imports). A new product must be
 * added to `PRODUCTS`; `pnpm test:identity` fails until it is.
 */

import {
  FROTHER_GIFT_PRICE_ID,
  MERCH_PRICE_IDS,
  PROTEIN_PRICE_IDS,
  RITUAL_LEGACY_SUB_PRICE_IDS,
  RITUAL_PRICE_IDS,
  type MerchPriceKey,
} from "lib/stripe-constants";
import { defaultLineForSlug, resolvePriceId } from "lib/cart/price-id-map";
import { merchSlugForPriceKey } from "lib/cart/merch-config";

/** Shopify product handle. Equal to the feed `g:id`. */
export type CatalogId = string;
export type PurchaseType = "subscription" | "onetime";

/** Route slug → catalog facts. The only place a slug meets a handle. */
export const PRODUCTS: Record<
  string,
  { id: CatalogId; name: string; route: string }
> = {
  "mujo-ritual": {
    id: "the-ritual",
    name: "The Ritual",
    route: "/products/mujo-ritual",
  },
  "mujo-frother": {
    id: "electric-frother",
    name: "Electric Frother",
    route: "/products/mujo-frother",
  },
  "mujo-crew": {
    id: "crew-neck-sweatshirt",
    name: "Crewneck",
    route: "/products/mujo-crew",
  },
  "mujo-tee": {
    id: "mujo-t-shirt",
    name: "Organic Tee",
    route: "/products/mujo-tee",
  },
  "mujo-hat": {
    id: "mujo-baseball-hat",
    name: "Baseball Cap",
    route: "/products/mujo-hat",
  },
  "protein-powder": {
    id: "protein-powder",
    name: "Protein Powder",
    route: "/products/protein-powder",
  },
};

export function catalogIdForSlug(slug: string): CatalogId | null {
  return PRODUCTS[slug]?.id ?? null;
}

export function slugForCatalogId(id: CatalogId): string | null {
  for (const [slug, p] of Object.entries(PRODUCTS)) {
    if (p.id === id) return slug;
  }
  return null;
}

/** Shopify handle → route, for the product feed. Derived, never typed twice. */
export const HANDLE_TO_ROUTE: Record<string, string> = Object.fromEntries(
  Object.values(PRODUCTS).map((p) => [p.id, p.route]),
);

export type PriceIdentity = {
  slug: string;
  id: CatalogId;
  name: string;
  /** Key in the Price ID maps (`25-subscription-6wk`, `onetime`, `tee_desert_s`). */
  variantKey: string;
  variantTitle: string;
  purchaseType: PurchaseType;
  /** Major units (dollars). */
  unitPrice: number;
  /** Site-relative image path. */
  image: string;
};

/** Every sellable Price ID with its slug and map key. Unset env vars skipped. */
function priceEntries(): Array<{
  priceId: string;
  slug: string;
  variantKey: string;
}> {
  const out: Array<{ priceId: string; slug: string; variantKey: string }> = [];
  for (const [key, priceId] of Object.entries(RITUAL_PRICE_IDS)) {
    if (priceId) out.push({ priceId, slug: "mujo-ritual", variantKey: key });
  }
  for (const [key, priceId] of Object.entries(PROTEIN_PRICE_IDS)) {
    if (priceId) out.push({ priceId, slug: "protein-powder", variantKey: key });
  }
  for (const [key, priceId] of Object.entries(MERCH_PRICE_IDS)) {
    if (priceId) {
      out.push({
        priceId,
        slug: merchSlugForPriceKey(key as MerchPriceKey),
        variantKey: key,
      });
    }
  }
  return out;
}

/**
 * Stripe Price ID → the product it sells. Null for unknown IDs and for the
 * free first-order frother (a gift is not a purchased product).
 */
export function identifyPrice(stripePriceId: string): PriceIdentity | null {
  if (!stripePriceId) return null;
  if (FROTHER_GIFT_PRICE_ID && stripePriceId === FROTHER_GIFT_PRICE_ID) {
    return null;
  }

  let entry = priceEntries().find((e) => e.priceId === stripePriceId);
  // Existing subscribers still renewing on a pre-2026-10 Ritual Price.
  if (!entry && RITUAL_LEGACY_SUB_PRICE_IDS.includes(stripePriceId)) {
    entry = {
      priceId: stripePriceId,
      slug: "mujo-ritual",
      variantKey: "25-subscription-legacy",
    };
  }
  if (!entry) return null;

  const line = resolvePriceId(stripePriceId);
  const product = PRODUCTS[entry.slug];
  if (!line || !product) return null;

  return {
    slug: entry.slug,
    id: product.id,
    name: product.name,
    variantKey: entry.variantKey,
    variantTitle: line.variantTitle,
    purchaseType: line.isSubscription ? "subscription" : "onetime",
    unitPrice: line.unitAmountCents / 100,
    image: line.image.url,
  };
}

/** Inverse of `identifyPrice`, for the cart restore link. Current Prices only. */
export function priceIdForVariant(
  slug: string,
  variantKey: string,
): string | null {
  const hit = priceEntries().find(
    (e) => e.slug === slug && e.variantKey === variantKey,
  );
  return hit?.priceId ?? null;
}

/** The price a product page shows by default, in dollars. */
export function defaultPrice(slug: string): number {
  const line = defaultLineForSlug(slug);
  return line ? line.unitAmountCents / 100 : 0;
}

/** The image a product page leads with, as a site-relative path. */
export function defaultImage(slug: string): string {
  return defaultLineForSlug(slug)?.image.url ?? "";
}
