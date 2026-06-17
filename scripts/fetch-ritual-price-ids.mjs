// scripts/fetch-ritual-price-ids.mjs
//
// Reads the 4 Stripe Price IDs for The Ritual (10 servings × {one-time,sub} +
// 25 servings × {one-time,sub}) and writes them to .env.local so the PDP can
// reference them client-side via NEXT_PUBLIC_* mirrors.
//
// Usage:
//   node --env-file=.env.local scripts/fetch-ritual-price-ids.mjs
//
// Idempotent: re-runs overwrite the 4 RITUAL_PRICE_* lines in .env.local.

import Stripe from "stripe";
import fs from "node:fs";
import path from "node:path";

if (!process.env.STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY not set in env");
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-04-22.dahlia",
});

// Find the Ritual product by Shopify handle metadata (set by mirror script).
async function findRitualProduct() {
  const list = await stripe.products.search({
    query: "metadata['shopify_handle']:'the-ritual' AND active:'true'",
    limit: 5,
  });
  if (list.data.length === 0) {
    throw new Error(
      "No active Stripe Product with metadata.shopify_handle = 'the-ritual'. Has the mirror script been run?",
    );
  }
  if (list.data.length > 1) {
    console.warn(
      `Found ${list.data.length} matches; using first: ${list.data[0].id}`,
    );
  }
  return list.data[0];
}

async function listActivePrices(productId) {
  const list = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100,
  });
  return list.data;
}

// Map prices to buckets by unit_amount × recurring × interval_count.
//   One-time:      $27.00 = 2700¢ → ritual-10,  $65.00 = 6500¢ → ritual-25
//   Subscription:  the 15% subscriber discount is BAKED INTO the Price (Option A —
//     not a checkout coupon), so subscription Prices are retail × 0.85:
//       2700 × 0.85 = 2295¢ → ritual-10 sub,  6500 × 0.85 = 5525¢ → ritual-25 sub
//   recurring → subscription, else one-time
//   The 25-serving subscription has THREE cadences at the same amount; they are
//   disambiguated by interval_count: 4 → 4-week (primary), 6 → 6-week, 8 → 8-week.
const SUBSCRIBER_DISCOUNT = 0.15; // keep in sync with mirror-shopify-to-stripe.ts
const SUB_10 = Math.round(2700 * (1 - SUBSCRIBER_DISCOUNT)); // 2295
const SUB_25 = Math.round(6500 * (1 - SUBSCRIBER_DISCOUNT)); // 5525

function bucketize(prices) {
  const result = {
    RITUAL_PRICE_10_ONETIME: null,
    RITUAL_PRICE_10_SUBSCRIPTION: null,
    RITUAL_PRICE_25_ONETIME: null,
    RITUAL_PRICE_25_SUBSCRIPTION: null,
    RITUAL_PRICE_25_SUBSCRIPTION_6W: null,
    RITUAL_PRICE_25_SUBSCRIPTION_8W: null,
  };

  for (const p of prices) {
    const sub = Boolean(p.recurring);
    const count = p.recurring?.interval_count ?? null;
    if (p.unit_amount === 2700 && !sub) result.RITUAL_PRICE_10_ONETIME = p.id;
    // 10-serving sub: prefer the 4-week (primary) cadence for the single bucket.
    else if (p.unit_amount === SUB_10 && sub && count === 4)
      result.RITUAL_PRICE_10_SUBSCRIPTION = p.id;
    else if (p.unit_amount === 6500 && !sub)
      result.RITUAL_PRICE_25_ONETIME = p.id;
    else if (p.unit_amount === SUB_25 && sub && count === 6)
      result.RITUAL_PRICE_25_SUBSCRIPTION_6W = p.id;
    else if (p.unit_amount === SUB_25 && sub && count === 8)
      result.RITUAL_PRICE_25_SUBSCRIPTION_8W = p.id;
    else if (p.unit_amount === SUB_25 && sub)
      result.RITUAL_PRICE_25_SUBSCRIPTION = p.id;
  }

  return result;
}

function writeEnvLocal(updates) {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const existing = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8")
    : "";
  const lines = existing.split("\n");

  // Mirror non-public IDs to NEXT_PUBLIC_* for the client component to consume.
  // The Price IDs themselves aren't secret (they're sent to the browser anyway
  // when posting to /api/checkout); exposing them via NEXT_PUBLIC_ is safe.
  const allKeys = {
    ...updates,
    NEXT_PUBLIC_RITUAL_PRICE_10_ONETIME: updates.RITUAL_PRICE_10_ONETIME,
    NEXT_PUBLIC_RITUAL_PRICE_10_SUBSCRIPTION:
      updates.RITUAL_PRICE_10_SUBSCRIPTION,
    NEXT_PUBLIC_RITUAL_PRICE_25_ONETIME: updates.RITUAL_PRICE_25_ONETIME,
    NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION:
      updates.RITUAL_PRICE_25_SUBSCRIPTION,
    NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION_6W:
      updates.RITUAL_PRICE_25_SUBSCRIPTION_6W,
    NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION_8W:
      updates.RITUAL_PRICE_25_SUBSCRIPTION_8W,
  };

  const replaced = new Set();
  const next = lines.map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=/);
    if (!m) return line;
    const key = m[1];
    if (key in allKeys && allKeys[key]) {
      replaced.add(key);
      return `${key}=${allKeys[key]}`;
    }
    return line;
  });

  // Append new keys not already in the file.
  const additions = Object.entries(allKeys)
    .filter(([k, v]) => v && !replaced.has(k))
    .map(([k, v]) => `${k}=${v}`);

  if (additions.length > 0) {
    if (next[next.length - 1] !== "") next.push("");
    next.push(
      "# Ritual Stripe Price IDs (added by fetch-ritual-price-ids.mjs)",
    );
    next.push(...additions);
    next.push("");
  }

  fs.writeFileSync(envPath, next.join("\n"));
  console.log(
    `\n✓ Wrote ${replaced.size + additions.length} keys to .env.local`,
  );
}

async function main() {
  console.log("Finding Ritual product in Stripe...");
  const product = await findRitualProduct();
  console.log(`  Product: ${product.id} (${product.name})`);

  console.log("Listing active prices...");
  const prices = await listActivePrices(product.id);
  console.log(`  Found ${prices.length} active prices`);

  const buckets = bucketize(prices);
  console.log("\nMapped:");
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`  ${k} = ${v ?? "(missing)"}`);
  }

  const missing = Object.entries(buckets)
    .filter(([_, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    console.warn(
      `\n⚠ Missing ${missing.length} bucket(s): ${missing.join(", ")}`,
    );
    console.warn(
      "  These prices were expected from the mirror script. Re-run scripts/mirror-shopify-to-stripe.ts if needed.",
    );
  }

  writeEnvLocal(buckets);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
