// scripts/create-ritual-prices-2026-10.mjs
//
// 2026-10 Ritual price change: $65.00 → $59.99 one-time, $55.25 → $50.99
// subscription (15% baked in) at every cadence. Stripe Prices can't be edited,
// so this creates NEW Prices next to the current ones, copying each current
// Price's product, cadence, tax_behavior and metadata (incl. shopify_variant_id,
// so mirrored orders stay variant-linked).
//
// It never archives anything. Existing subscribers keep renewing on the old
// $55.25 Prices until they are moved in a separate step, so the old
// subscription Price IDs are written to NEXT_PUBLIC_RITUAL_LEGACY_SUB_PRICE_IDS.
//
// Stripe-only (zero Shopify writes). Idempotent: reuses a matching active Price.
// Do NOT run scripts/mirror-shopify-to-stripe.ts for the Ritual until existing
// subscribers have been moved — it archives Prices whose amount has drifted.
//
// Usage:
//   pnpm exec node scripts/create-ritual-prices-2026-10.mjs                      # dry run (sandbox .env.local)
//   pnpm exec node scripts/create-ritual-prices-2026-10.mjs --apply              # create + write env vars
//   pnpm exec node scripts/create-ritual-prices-2026-10.mjs --env=.env.live --apply

import Stripe from "stripe";
import fs from "fs";

const APPLY = process.argv.includes("--apply");
const envArg = process.argv.find((a) => a.startsWith("--env="));
const ENV_PATH = envArg ? envArg.split("=")[1] : ".env.local";

const ONETIME_CENTS = 5999;
const SUB_CENTS = 5099;
const OLD_ONETIME_CENTS = 6500;
const OLD_SUB_CENTS = 5525;

// env key → { new amount, the amount the current Price is expected to have }
const TARGETS = [
  { key: "NEXT_PUBLIC_RITUAL_PRICE_25_ONETIME", cents: ONETIME_CENTS, old: OLD_ONETIME_CENTS, sub: false },
  { key: "NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION", cents: SUB_CENTS, old: OLD_SUB_CENTS, sub: true },
  { key: "NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION_6W", cents: SUB_CENTS, old: OLD_SUB_CENTS, sub: true },
  { key: "NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION_8W", cents: SUB_CENTS, old: OLD_SUB_CENTS, sub: true },
  { key: "NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION_12W", cents: SUB_CENTS, old: OLD_SUB_CENTS, sub: true },
];
const LEGACY_KEY = "NEXT_PUBLIC_RITUAL_LEGACY_SUB_PRICE_IDS";

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
function writeEnvVar(path, key, value) {
  const raw = fs.readFileSync(path, "utf8");
  const re = new RegExp(`^${key}=.*$`, "m");
  const next = re.test(raw) ? raw.replace(re, `${key}=${value}`) : raw.trimEnd() + `\n${key}=${value}\n`;
  fs.writeFileSync(path, next);
  console.log(`  ✓ ${key}=${value}`);
}

const env = loadEnv(ENV_PATH);
const key = env.STRIPE_SECRET_KEY || "";
if (!key.startsWith("sk_")) {
  console.error(`No usable STRIPE_SECRET_KEY in ${ENV_PATH}.`);
  process.exit(1);
}
const MODE = key.startsWith("sk_live_") ? "LIVE" : "TEST";
const stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
console.log(`\n=== Ritual 2026-10 prices — ${MODE}${APPLY ? " (APPLY)" : " (dry run)"} | ${ENV_PATH} ===`);

const cadence = (p) =>
  p.recurring ? `every ${p.recurring.interval_count} ${p.recurring.interval}` : "one-time";
const sameShape = (a, b) =>
  (!a.recurring && !b.recurring) ||
  (a.recurring &&
    b.recurring &&
    a.recurring.interval === b.recurring.interval &&
    a.recurring.interval_count === b.recurring.interval_count);

const legacy = new Set(
  (env[LEGACY_KEY] || "").split(",").map((s) => s.trim()).filter(Boolean),
);
const updates = {};

for (const t of TARGETS) {
  const currentId = env[t.key];
  if (!currentId) {
    console.log(`– ${t.key} is not set in ${ENV_PATH}; skipping (cadence not offered here)`);
    continue;
  }
  const current = await stripe.prices.retrieve(currentId);
  const productId = typeof current.product === "string" ? current.product : current.product.id;

  if (current.unit_amount === t.cents) {
    console.log(`✓ ${t.key} already at $${(t.cents / 100).toFixed(2)} (${current.id}, ${cadence(current)})`);
    continue;
  }
  if (current.unit_amount !== t.old) {
    console.log(
      `⚠ ${t.key} → ${current.id} is $${(current.unit_amount / 100).toFixed(2)}, expected $${(t.old / 100).toFixed(2)}. Creating the new Price anyway; check this one by hand.`,
    );
  }
  if (Boolean(current.recurring) !== t.sub) {
    console.error(`✗ ${t.key} → ${current.id} is ${cadence(current)}, which does not match this key. Stopping.`);
    process.exit(1);
  }

  const list = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const wantVariant = current.metadata?.shopify_variant_id;
  let next = list.data.find(
    (p) =>
      p.unit_amount === t.cents &&
      sameShape(p, current) &&
      (!wantVariant || p.metadata?.shopify_variant_id === wantVariant),
  );

  if (next) {
    console.log(`✓ reuse ${next.id} $${(t.cents / 100).toFixed(2)} ${cadence(next)} for ${t.key}`);
  } else if (!APPLY) {
    console.log(
      `→ Would create $${(t.cents / 100).toFixed(2)} ${cadence(current)} on ${productId} (replaces ${current.id} for new customers) for ${t.key}`,
    );
  } else {
    next = await stripe.prices.create({
      product: productId,
      currency: current.currency,
      unit_amount: t.cents,
      ...(current.nickname ? { nickname: current.nickname } : {}),
      ...(current.tax_behavior && current.tax_behavior !== "unspecified"
        ? { tax_behavior: current.tax_behavior }
        : {}),
      ...(current.recurring
        ? { recurring: { interval: current.recurring.interval, interval_count: current.recurring.interval_count } }
        : {}),
      metadata: { ...current.metadata, price_change: "2026-10" },
    });
    console.log(`✓ Created ${next.id} $${(t.cents / 100).toFixed(2)} ${cadence(next)} for ${t.key}`);
  }

  if (next) updates[t.key] = next.id;
  if (t.sub) legacy.add(current.id);
}

console.log("\nEnv:");
if (APPLY) {
  for (const [k, v] of Object.entries(updates)) writeEnvVar(ENV_PATH, k, v);
  if (legacy.size) writeEnvVar(ENV_PATH, LEGACY_KEY, [...legacy].join(","));
  console.log(
    `\nSet the same values in Vercel (${MODE === "LIVE" ? "Production" : "Preview"}) via the REST API, then redeploy.`,
  );
} else {
  for (const [k, v] of Object.entries(updates)) console.log(`  ${k}=${v}`);
  console.log(`  ${LEGACY_KEY}=${[...legacy].join(",") || "(none)"}`);
  console.log("\nDry run. Nothing was created or written. Re-run with --apply.");
}
