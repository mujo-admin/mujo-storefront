// scripts/create-sub-cadence-price.mjs
//
// Creates an "every N weeks" Ritual subscription Price (Subscription v2 extra
// cadence) by cloning the existing 4-week subscription Price's product / amount
// / currency / tax_behavior, with recurring { interval: 'week', interval_count: N }.
//
// Why a dedicated script (not the full mirror): the mirror writes Stripe price
// IDs back to SHOPIFY product metafields, and the Shopify store is shared between
// the sandbox and live Stripe accounts. Running the mirror in sandbox would
// overwrite the live store's metafields with sandbox IDs. This script only
// creates a Stripe Price — zero Shopify writes — so it's safe in either account.
// The Price is surfaced to the app purely via the
// NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION_{N}W env var it writes.
//
// Idempotent: if an active week×N Price at the same amount already exists on the
// product, it reuses it and creates nothing.
//
// Reads STRIPE_SECRET_KEY + NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION from the env
// file (default .env.local — sandbox). For LIVE, pass --env=.env.live.
//
// Usage:
//   pnpm exec node scripts/create-sub-cadence-price.mjs --weeks=6            # dry run
//   pnpm exec node scripts/create-sub-cadence-price.mjs --weeks=12 --apply   # create
//   pnpm exec node scripts/create-sub-cadence-price.mjs --weeks=12 --env=.env.live --apply

import Stripe from "stripe";
import fs from "fs";

const APPLY = process.argv.includes("--apply");
const weeksArg = process.argv.find((a) => a.startsWith("--weeks="));
const WEEKS = weeksArg ? parseInt(weeksArg.split("=")[1], 10) : NaN;
if (!Number.isInteger(WEEKS) || WEEKS < 1) {
  console.error(
    "Pass --weeks=N (a positive integer), e.g. --weeks=6 or --weeks=12.",
  );
  process.exit(1);
}
const envArg = process.argv.find((a) => a.startsWith("--env="));
const ENV_PATH = envArg ? envArg.split("=")[1] : ".env.local";
const ENV_KEY = `NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION_${WEEKS}W`;

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

// Write the Price ID into the env file directly (account-agnostic — does not
// depend on fetch-ritual-price-ids' amount-matching, which expects the Option-A
// discounted 5525¢ and won't match sandbox's full-retail sub prices).
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
  `\n=== create ${WEEKS}-week Ritual sub price — ${MODE}${APPLY ? " (APPLY)" : " (dry run)"} | ${ENV_PATH} ===`,
);

const base = await stripe.prices.retrieve(baseId);
const productId =
  typeof base.product === "string" ? base.product : base.product.id;
console.log(
  `4-week base price: ${base.id} | ${base.unit_amount}¢ ${base.currency} | ${base.recurring?.interval}x${base.recurring?.interval_count} | product ${productId}`,
);

// Idempotency: look for an existing active week×N price at the same amount.
const existing = await stripe.prices.list({
  product: productId,
  active: true,
  limit: 100,
});
const already = existing.data.find(
  (p) =>
    p.recurring?.interval === "week" &&
    p.recurring?.interval_count === WEEKS &&
    p.unit_amount === base.unit_amount,
);
if (already) {
  console.log(
    `\n✓ A ${WEEKS}-week price already exists: ${already.id} — reusing it.`,
  );
  if (APPLY) writeEnvVar(ENV_PATH, ENV_KEY, already.id);
  else console.log("[dry run] Re-run with --apply to write the env var.");
  process.exit(0);
}

console.log(
  `\n→ Will create: week×${WEEKS} @ ${base.unit_amount}¢ ${base.currency} on product ${productId}`,
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
  nickname: `Mujo Ritual — Subscribe & Save (${WEEKS}-week)`,
  ...(base.tax_behavior && base.tax_behavior !== "unspecified"
    ? { tax_behavior: base.tax_behavior }
    : {}),
  recurring: { interval: "week", interval_count: WEEKS },
  metadata: {
    ...base.metadata,
    cadence: `${WEEKS}-week`,
    cloned_from: base.id,
  },
});
console.log(
  `\n✓ Created ${WEEKS}-week price: ${created.id} (${created.unit_amount}¢ every ${WEEKS} weeks)`,
);
writeEnvVar(ENV_PATH, ENV_KEY, created.id);
console.log(
  `For LIVE, also set ${ENV_KEY} in Vercel Production (REST API per project_vercel_cli_env_pipe_bug).`,
);
