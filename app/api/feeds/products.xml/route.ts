import { buildFeedItems, renderFeedXml } from "lib/catalog";

/**
 * GET /api/feeds/products.xml
 *
 * The product feed Meta Commerce Manager (and later TikTok / Google Merchant
 * Center) reads on a schedule. Replaces Shopify's own catalog sync, which
 * published Shopify handles and therefore linked to pages that don't exist.
 *
 * Cached for an hour — Meta polls a few times a day at most, and the
 * underlying Shopify fetch is itself cached.
 */
export const revalidate = 3600;

export async function GET() {
  const items = await buildFeedItems();

  return new Response(renderFeedXml(items), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
