/**
 * Product catalog — the join between Shopify and this storefront.
 *
 * Shopify stays the source of truth for everything that describes a product:
 * title, description, images, price, stock. This module adds the one fact
 * Shopify does not have — **which URL renders it here** — and produces the
 * feed Meta and TikTok read.
 *
 * Why the route map lives in code rather than a Shopify metafield (a
 * deviation from the explore doc, made deliberately): a route is defined by
 * the filesystem under `app/products/`. A metafield can point at a route that
 * does not exist, which is precisely the failure we are fixing — the Meta
 * catalog spent months linking to four pages that 404'd. Here the mapping sits
 * beside the redirects that back it up, and `scripts/validate-feed.ts` proves
 * every link resolves. A new product needs a page built anyway, so the
 * metafield's apparent flexibility would have been illusory.
 */

import { getProducts } from "lib/shopify";
import { baseUrl } from "lib/utils";

/**
 * Shopify handle → the route that renders it.
 *
 * Keep in sync with the redirects in `next.config.ts`. Anything absent is
 * omitted from the feed rather than guessed at: a missing product is a gap,
 * a wrong link is a dead end for a real shopper.
 */
export const HANDLE_TO_ROUTE: Record<string, string> = {
  "the-ritual": "/products/mujo-ritual",
  "electric-frother": "/products/mujo-frother",
  "crew-neck-sweatshirt": "/products/mujo-crew",
  "mujo-t-shirt": "/products/mujo-tee",
  "mujo-baseball-hat": "/products/mujo-hat",
  "protein-powder": "/products/protein-powder",
};

/** Google/Meta product category, per handle. Improves ad matching. */
const PRODUCT_CATEGORY: Record<string, string> = {
  "the-ritual": "Food, Beverages & Tobacco > Beverages",
  "electric-frother": "Home & Garden > Kitchen & Dining",
  "crew-neck-sweatshirt": "Apparel & Accessories > Clothing",
  "mujo-t-shirt": "Apparel & Accessories > Clothing",
  "mujo-baseball-hat": "Apparel & Accessories > Clothing Accessories",
  "protein-powder": "Health & Beauty > Health Care > Fitness & Nutrition > Protein Supplements",
};

export type FeedItem = {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  price: string;
  availability: "in stock" | "out of stock";
  brand: string;
  condition: "new";
  productType?: string;
};

/**
 * Build the feed from live Shopify data.
 *
 * Products without a known route are skipped — see HANDLE_TO_ROUTE.
 */
export async function buildFeedItems(): Promise<FeedItem[]> {
  const products = await getProducts({});
  const items: FeedItem[] = [];

  for (const product of products) {
    const route = HANDLE_TO_ROUTE[product.handle];
    if (!route) continue;

    const amount = product.priceRange.minVariantPrice.amount;
    const currency = product.priceRange.minVariantPrice.currencyCode;

    items.push({
      id: product.handle,
      title: product.title,
      // Meta rejects empty descriptions and truncates past 5000 chars.
      description:
        (product.description || product.seo?.description || product.title)
          .slice(0, 4999),
      link: `${baseUrl}${route}`,
      imageLink: product.featuredImage?.url ?? "",
      price: `${Number(amount).toFixed(2)} ${currency}`,
      availability: product.availableForSale ? "in stock" : "out of stock",
      brand: "Mujo",
      condition: "new",
      productType: PRODUCT_CATEGORY[product.handle],
    });
  }

  return items;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Render items as an RSS 2.0 feed with Google's `g:` namespace — the format
 *  Meta Commerce Manager and TikTok both accept as a scheduled feed. */
export function renderFeedXml(items: FeedItem[]): string {
  const entries = items
    .map((i) => {
      const optional = i.productType
        ? `\n      <g:product_type>${escapeXml(i.productType)}</g:product_type>`
        : "";
      return `    <item>
      <g:id>${escapeXml(i.id)}</g:id>
      <g:title>${escapeXml(i.title)}</g:title>
      <g:description>${escapeXml(i.description)}</g:description>
      <g:link>${escapeXml(i.link)}</g:link>
      <g:image_link>${escapeXml(i.imageLink)}</g:image_link>
      <g:price>${escapeXml(i.price)}</g:price>
      <g:availability>${i.availability}</g:availability>
      <g:condition>${i.condition}</g:condition>
      <g:brand>${escapeXml(i.brand)}</g:brand>${optional}
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Mujo Product Catalog</title>
    <link>${escapeXml(baseUrl)}</link>
    <description>Mujo products, generated from the live storefront.</description>
${entries}
  </channel>
</rss>
`;
}
