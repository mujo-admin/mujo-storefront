// scripts/create-6week-sub-price.mjs
//
// Creates the "every 6 weeks" Ritual subscription Price (Subscription v2 third
// cadence) by cloning the existing 4-week subscription Price's product / amount
// / currency / tax_behavior, with recurring { interval: 'week', interval_count: 6 }.
//
// Why a dedicated script (not the full mirror): the mirror writes Stripe price
// IDs back to SHOPIFY product metafields, and the Shopify store is shared between
// the sandbox and live Stripe accounts. Running the mirror in sandbox would
// overwrite the live store's metafields with sandbox IDs. This script only
// creates a Stripe Price — zero Shopify writes — so it's safe in either account.
// The 6-week Price is surfaced to the app purely via the
// NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION_6W env var (run fetch-ritual-price-ids
// next), never a Shopify metafield.
//
// Idempotent: if an active week×6 Price at the same amount already exists on the
// product, it reuses it and creates nothing.
//
// Reads STRIPE_SECRET_KEY + NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION from the env
// file (default .env.local — sandbox). For LIVE, pass --env=.env.live.
//
// Usage:
//   pnpm exec node scripts/create-6week-sub-price.mjs            # dry run
//   pnpm exec node scripts/create-6week-sub-price.mjs --apply    # create
//   pnpm exec node scripts/create-6week-sub-price.mjs --env=.env.live --apply

import Stripe from "stripe";
import fs from "fs";

const APPLY = process.argv.includes("--apply");
const envArg = process.argv.find((a) => a.startsWith("--env="));
const ENV_PATH = envArg ? envArg.split("=")[1] : ".env.local";

function loadEnv(path) {
  if (!fs.existsSync(path)) {
    console.error(`Env file not found: ${path}`);
    process.exit(1);
  }
  const env = {};
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

// Write the 6-week Price ID into the env file directly (account-agnostic — does
// not depend on fetch-ritual-price-ids' amount-matching, which expects the
// Option-A discounted 5525¢ and won't match sandbox's full-retail sub prices).
function writeEnvVar(path, key, value) {
  const raw = fs.readFileSync(path, "utf8");
  const re = new RegExp(`^${key}=.*$`, "m");
  const next = re.test(raw)
    ? raw.replace(re, `${key}=${value}`)
    : raw.trimEnd() + `\n${key}=${value}\n`;
  fs.writeFileSync(path, next);
  console.log(`✓ Wrote ${key}=${value} to ${path}`);
}

const env = loadEnv(ENV_PATH);
const key = env.STRIPE_SECRET_KEY || "";
if (!key.startsWith("sk_")) {
  console.error(`No usable STRIPE_SECRET_KEY in ${ENV_PATH}.`);
  process.exit(1);
}
const MODE = key.startsWith("sk_live_") ? "LIVE" : "TEST";
const stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia" });

const baseId = env.NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION;
if (!baseId) {
  console.error(
    "NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION (4-week base) not set — cannot clone.",
  );
  process.exit(1);
}

console.log(
  `\n=== create 6-week Ritual sub price — ${MODE}${APPLY ? " (APPLY)" : " (dry run)"} | ${ENV_PATH} ===`,
);

const base = await stripe.prices.retrieve(baseId);
const productId =
  typeof base.product === "string" ? base.product : base.product.id;
console.log(
  `4-week base price: ${base.id} | ${base.unit_amount}¢ ${base.currency} | ${base.recurring?.interval}x${base.recurring?.interval_count} | product ${productId}`,
);

// Idempotency: look for an existing active week×6 price at the same amount.
const existing = await stripe.prices.list({
  product: productId,
  active: true,
  limit: 100,
});
const already = existing.data.find(
  (p) =>
    p.recurring?.interval === "week" &&
    p.recurring?.interval_count === 6 &&
    p.unit_amount === base.unit_amount,
);
if (already) {
  console.log(`\n✓ A 6-week price already exists: ${already.id} — reusing it.`);
  if (APPLY)
    writeEnvVar(
      ENV_PATH,
      "NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION_6W",
      already.id,
    );
  else console.log("[dry run] Re-run with --apply to write the env var.");
  process.exit(0);
}

console.log(
  `\n→ Will create: week×6 @ ${base.unit_amount}¢ ${base.currency} on product ${productId}`,
);
if (!APPLY) {
  console.log(
    "[dry run] Re-run with --apply to create it + write the env var.",
  );
  process.exit(0);
}

const created = await stripe.prices.create({
  product: productId,
  unit_amount: base.unit_amount,
  currency: base.currency,
  nickname: "Mujo Ritual — Subscribe & Save (6-week)",
  ...(base.tax_behavior && base.tax_behavior !== "unspecified"
    ? { tax_behavior: base.tax_behavior }
    : {}),
  recurring: { interval: "week", interval_count: 6 },
  metadata: { ...base.metadata, cadence: "6-week", cloned_from: base.id },
});
console.log(
  `\n✓ Created 6-week price: ${created.id} (${created.unit_amount}¢ every 6 weeks)`,
);
writeEnvVar(
  ENV_PATH,
  "NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION_6W",
  created.id,
);
console.log(
  "For LIVE, also set this same var in Vercel Production (REST API per project_vercel_cli_env_pipe_bug).",
);
