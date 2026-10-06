/**
 * Smoke test: every product has one tracking ID, and every Price maps to it.
 *
 *   pnpm test:identity
 *
 * Fails (exit 1) when:
 *   - a configured Stripe Price ID does not resolve to a catalog ID, which
 *     would send an event Meta and GA4 cannot match to a product;
 *   - a product in PRODUCTS has no default price or image;
 *   - a cart built from a Price does not survive the restore link round trip.
 *
 * Run after adding a product or a Price. Reads .env.local for the Price IDs.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

async function main() {
  const { RITUAL_PRICE_IDS, PROTEIN_PRICE_IDS, MERCH_PRICE_IDS } = await import(
    "../lib/stripe-constants"
  );
  const {
    PRODUCTS,
    HANDLE_TO_ROUTE,
    identifyPrice,
    defaultPrice,
    defaultImage,
  } = await import("../lib/product-identity");
  const { buildRestorePath, parseRestoreParam } = await import(
    "../lib/cart/restore"
  );

  let failures = 0;
  const fail = (msg: string) => {
    failures += 1;
    console.error(`FAIL  ${msg}`);
  };

  const maps: Record<string, Record<string, string>> = {
    RITUAL_PRICE_IDS,
    PROTEIN_PRICE_IDS,
    MERCH_PRICE_IDS,
  };
  let checked = 0;
  let unset = 0;
  for (const [mapName, map] of Object.entries(maps)) {
    for (const [key, priceId] of Object.entries(map)) {
      if (!priceId) {
        unset += 1;
        continue;
      }
      checked += 1;
      const identity = identifyPrice(priceId);
      if (!identity) {
        fail(`${mapName}.${key} (${priceId}) has no catalog ID`);
        continue;
      }
      if (!HANDLE_TO_ROUTE[identity.id]) {
        fail(
          `${mapName}.${key} resolves to "${identity.id}", which is not in the feed map`,
        );
      }
      const path = buildRestorePath([{ stripePriceId: priceId, quantity: 2 }]);
      const back = parseRestoreParam(
        path ? new URL(path, "https://x.test").searchParams.get("i") : null,
      );
      if (
        back.length !== 1 ||
        back[0]?.stripePriceId !== priceId ||
        back[0]?.quantity !== 2
      ) {
        fail(`${mapName}.${key} does not survive the restore link (${path})`);
      }
    }
  }

  for (const [slug, product] of Object.entries(PRODUCTS)) {
    if (!(defaultPrice(slug) > 0)) fail(`${slug} has no default price`);
    if (!defaultImage(slug)) fail(`${slug} has no default image`);
    if (HANDLE_TO_ROUTE[product.id] !== product.route) {
      fail(`${slug}: feed map route does not match`);
    }
  }

  if (
    parseRestoreParam("nonsense~nope~1,~~,the-ritual~missing~3").length !== 0
  ) {
    fail("a garbage restore link produced cart lines");
  }

  console.log(
    `${checked} Price IDs checked, ${unset} not set in this environment, ` +
      `${Object.keys(PRODUCTS).length} products.`,
  );
  if (failures > 0) {
    console.error(`\n${failures} failure(s).`);
    process.exit(1);
  }
  console.log("OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
