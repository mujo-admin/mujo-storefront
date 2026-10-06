/**
 * Validate the product feed against the live site.
 *
 * The Meta catalog spent months linking to four pages that returned 404, and
 * nothing caught it. This does. Run it after any catalog or route change:
 *
 *   pnpm tsx scripts/validate-feed.ts                  # against production
 *   pnpm tsx scripts/validate-feed.ts <preview-url>    # against a preview
 *
 * Checks, per item:
 *   1. the link resolves (200, following redirects)
 *   2. the price in the feed also appears on the page it links to
 *
 * Exits non-zero on any failure, so it can gate a deploy.
 */

const base = process.argv[2]?.replace(/\/$/, "") || "https://www.mujoworld.com";

type Item = { id: string; link: string; price: string; availability: string };

function parseItems(xml: string): Item[] {
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const pick = (block: string, tag: string) =>
    block.match(new RegExp(`<g:${tag}>([\\s\\S]*?)</g:${tag}>`))?.[1]?.trim() ??
    "";
  return blocks.map((b) => ({
    id: pick(b, "id"),
    link: pick(b, "link"),
    price: pick(b, "price"),
    availability: pick(b, "availability"),
  }));
}

async function main() {
  const feedUrl = `${base}/api/feeds/products.xml`;
  console.log(`Feed: ${feedUrl}\n`);

  const res = await fetch(feedUrl);
  if (!res.ok) {
    console.error(`FAIL  feed returned ${res.status}`);
    process.exit(1);
  }

  const items = parseItems(await res.text());
  if (items.length === 0) {
    console.error("FAIL  feed contains no items");
    process.exit(1);
  }

  // One row per product in lib/product-identity.ts. A different count means a
  // product is missing from Shopify, unpublished, or not in the identity map.
  const EXPECTED_ITEMS = 6;
  let failures = 0;
  if (items.length !== EXPECTED_ITEMS) {
    failures++;
    console.error(
      `FAIL  feed has ${items.length} items, expected ${EXPECTED_ITEMS}: ${items.map((i) => i.id).join(", ")}\n`,
    );
  }

  for (const item of items) {
    const page = await fetch(item.link, { redirect: "follow" });
    const html = page.ok ? await page.text() : "";

    // "65.00 USD" -> the page may show "$65" / "$65.00" as text, OR carry the
    // figure in JSON-LD. Mujo's PDP buy boxes render client-side, so visible
    // price text is absent from server HTML — the structured data is what
    // Meta and Google actually read, and it's what must agree with the feed.
    const amount = item.price.split(" ")[0] ?? "";
    const whole = amount.replace(/\.00$/, "");
    const inText = html.includes(`$${amount}`) || html.includes(`$${whole}`);
    const inJsonLd = (html.match(
      /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
    ) ?? []).some(
      (block) =>
        block.includes(`"${whole}"`) ||
        block.includes(`"${amount}"`) ||
        block.includes(`:${whole},`),
    );
    const priceOnPage = inText || inJsonLd;

    const linkOk = page.ok;
    const ok = linkOk && priceOnPage;
    if (!ok) failures++;

    console.log(
      `${ok ? "ok  " : "FAIL"}  ${item.id.padEnd(22)} ${String(page.status).padEnd(4)} ${item.price.padEnd(11)} ${
        linkOk ? "" : "link dead"
      }${!linkOk || priceOnPage ? "" : "price absent from page text AND structured data"}`,
    );
  }

  console.log(
    `\n${items.length - failures}/${items.length} passed${failures ? ` — ${failures} FAILED` : ""}`,
  );
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
