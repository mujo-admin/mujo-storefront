// scripts/create-protein-prices.mjs
//
// Creates the Protein Powder (Vanilla Bean) Stripe Product + Prices, Stripe-only
// (zero Shopify writes, like create-sub-cadence-price.mjs), so it is safe to run
// against the sandbox or the live account. Idempotent: reuses an existing
// Product (metadata.mujo_product=protein-powder) and any matching active Price.
//
//   $44.99 one-time                 → NEXT_PUBLIC_PROTEIN_PRICE_ONETIME
//
// Pre-order is ONE-TIME ONLY until the powder ships (Kinga 2026-10-05). Pass
// --with-subscriptions later to also create $38.24 every 2/4/6/8 weeks
// (subscriber 15% baked into the Price, same model as the Ritual)
//                                   → NEXT_PUBLIC_PROTEIN_PRICE_SUB_{2,4,6,8}W
//
// Tax: copies the Ritual Product's tax_code (powdered drink mix) and the Ritual
// Price's tax_behavior so the powder taxes the same way. Confirm with the CPA.
//
// After a Shopify product exists, add metadata.shopify_variant_id (the variant
// GID) to each Price so mirrored orders are variant-linked for fulfilment:
//   --variant-gid=gid://shopify/ProductVariant/123 --apply
//
// Usage:
//   pnpm exec node scripts/create-protein-prices.mjs                       # dry run (sandbox .env.local)
//   pnpm exec node scripts/create-protein-prices.mjs --apply               # create + write env vars
//   pnpm exec node scripts/create-protein-prices.mjs --env=.env.live --apply

import Stripe from "stripe";
import fs from "fs";

const APPLY = process.argv.includes("--apply");
const envArg = process.argv.find((a) => a.startsWith("--env="));
const ENV_PATH = envArg ? envArg.split("=")[1] : ".env.local";
const variantArg = process.argv.find((a) => a.startsWith("--variant-gid="));
const VARIANT_GID = variantArg ? variantArg.split("=")[1] : "";

const ONETIME_CENTS = 4499;
const SUB_CENTS = 3824;
const CADENCES = process.argv.includes("--with-subscriptions") ? [2, 4, 6, 8] : [];

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
if (!/^(sk|rk)_(test|live)_/.test(key)) {
  console.error(`No usable STRIPE_SECRET_KEY in ${ENV_PATH}.`);
  process.exit(1);
}
const MODE = /^(sk|rk)_live_/.test(key) ? "LIVE" : "TEST";
const stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
console.log(`\n=== Protein Powder prices — ${MODE}${APPLY ? " (APPLY)" : " (dry run)"} | ${ENV_PATH} ===`);

// Tax settings from the Ritual (4-week sub Price → its Product).
let taxCode = "txcd_41054002";
let taxBehavior;
if (env.NEXT_PUBLIC_RITUAL_PRICE_25_ONETIME) {
  const rp = await stripe.prices.retrieve(env.NEXT_PUBLIC_RITUAL_PRICE_25_ONETIME, { expand: ["product"] });
  if (rp.tax_behavior && rp.tax_behavior !== "unspecified") taxBehavior = rp.tax_behavior;
  const prod = rp.product;
  if (prod && typeof prod === "object" && !prod.deleted && prod.tax_code) {
    taxCode = typeof prod.tax_code === "string" ? prod.tax_code : prod.tax_code.id;
  }
}
console.log(`tax_code ${taxCode} · tax_behavior ${taxBehavior ?? "(account default)"}`);

// Product
let product;
for await (const p of stripe.products.list({ active: true, limit: 100 })) {
  if (p.metadata?.mujo_product === "protein-powder") { product = p; break; }
}
if (product) console.log(`Product exists: ${product.id} (${product.name})`);
else if (!APPLY) console.log("→ Would create Product 'Protein Powder'");
else {
  product = await stripe.products.create({
    name: "Protein Powder",
    description: "Vanilla Bean · 450g pouch · 15 servings. Made with Lemna leaf and yellow pea protein.",
    tax_code: taxCode,
    metadata: { mujo_product: "protein-powder", shopify_handle: "protein-powder" },
  });
  console.log(`✓ Created Product ${product.id}`);
}

async function findOrCreate(spec) {
  if (product) {
    const list = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
    const hit = list.data.find((p) =>
      p.unit_amount === spec.unit_amount &&
      (spec.recurring ? p.recurring?.interval === "week" && p.recurring?.interval_count === spec.recurring.interval_count : !p.recurring));
    if (hit) {
      if (APPLY && VARIANT_GID && hit.metadata?.shopify_variant_id !== VARIANT_GID) {
        await stripe.prices.update(hit.id, { metadata: { shopify_variant_id: VARIANT_GID } });
        console.log(`  ✓ linked ${hit.id} → ${VARIANT_GID}`);
      }
      return hit.id;
    }
  }
  if (!APPLY) { console.log(`→ Would create ${spec.nickname}`); return null; }
  const created = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    unit_amount: spec.unit_amount,
    nickname: spec.nickname,
    ...(taxBehavior ? { tax_behavior: taxBehavior } : {}),
    ...(spec.recurring ? { recurring: { interval: "week", interval_count: spec.recurring.interval_count } } : {}),
    metadata: { mujo_product: "protein-powder", ...(VARIANT_GID ? { shopify_variant_id: VARIANT_GID } : {}) },
  });
  console.log(`✓ Created ${created.id} ${spec.nickname}`);
  return created.id;
}

const ids = {};
ids.NEXT_PUBLIC_PROTEIN_PRICE_ONETIME = await findOrCreate({ unit_amount: ONETIME_CENTS, nickname: "Protein Powder — One-time" });
for (const w of CADENCES) {
  ids[`NEXT_PUBLIC_PROTEIN_PRICE_SUB_${w}W`] = await findOrCreate({
    unit_amount: SUB_CENTS,
    recurring: { interval_count: w },
    nickname: `Protein Powder — Subscribe & Save (${w}-week)`,
  });
}

console.log("\nPrice IDs:");
for (const [k, v] of Object.entries(ids)) {
  if (v && APPLY) writeEnvVar(ENV_PATH, k, v);
  else console.log(`  ${k}=${v ?? "(not created — dry run)"}`);
}
if (APPLY) console.log(`\nSet these in Vercel (${MODE === "LIVE" ? "Production" : "Preview"}) via the REST API, then redeploy.`);
