// scripts/set-subscription-4week-interval.mjs
//
// Ensures the Mujo Ritual subscription Price bills on a true 4-week (28-day)
// cycle — matching the public Subscription Terms ("renews every 4 weeks").
//
// Stripe Price recurring intervals are IMMUTABLE, so this:
//   1. Reads the current sub price (NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION)
//   2. If it's already week x 4, no-op.
//   3. Otherwise clones it (same product / amount / currency / tax_behavior /
//      nickname / metadata) with recurring { interval: 'week', interval_count: 4 },
//      archives the old price (active: false), and rewrites the env var in .env.local.
//
// Idempotent + re-runnable. The canonical cutover path is the corrected
// mirror-shopify-to-stripe.ts (SUB_INTERVAL='week'/COUNT=4); this is the
// surgical validation/safety tool for the test env (and a backstop at live).
//
// Usage:  node scripts/set-subscription-4week-interval.mjs
//         node scripts/set-subscription-4week-interval.mjs --dry-run

import Stripe from 'stripe';
import fs from 'fs';

const ENV_PATH = '.env.local';
const ENV_KEY = 'NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION';
const DRY = process.argv.includes('--dry-run');

function loadEnv(path) {
  const env = {};
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function writeEnvVar(path, key, value) {
  const raw = fs.readFileSync(path, 'utf8');
  const re = new RegExp(`^${key}=.*$`, 'm');
  const next = re.test(raw)
    ? raw.replace(re, `${key}=${value}`)
    : raw.trimEnd() + `\n${key}=${value}\n`;
  fs.writeFileSync(path, next);
}

const env = loadEnv(ENV_PATH);
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' });
const MODE = env.STRIPE_SECRET_KEY.startsWith('sk_test') ? 'TEST' : 'LIVE';
console.log(`MODE: ${MODE}${DRY ? '  (dry-run)' : ''}`);

const oldId = env[ENV_KEY];
if (!oldId) {
  console.error(`${ENV_KEY} not set in ${ENV_PATH}`);
  process.exit(1);
}

const oldPrice = await stripe.prices.retrieve(oldId);
const cur = oldPrice.recurring;
console.log(`Current price: ${oldId}`);
console.log(`  ${oldPrice.unit_amount}¢ ${oldPrice.currency} | recurring: ${cur?.interval} x ${cur?.interval_count}`);

if (cur?.interval === 'week' && cur?.interval_count === 4) {
  console.log('\n✓ Already billing every 4 weeks. No change needed.');
  process.exit(0);
}

console.log('\n→ Needs a true 4-week price (week x 4).');
if (DRY) {
  console.log('  [dry-run] Would create week x 4 clone, archive the old price, and rewrite the env var.');
  process.exit(0);
}

const productId = typeof oldPrice.product === 'string' ? oldPrice.product : oldPrice.product.id;
const newPrice = await stripe.prices.create({
  product: productId,
  unit_amount: oldPrice.unit_amount,
  currency: oldPrice.currency,
  nickname: oldPrice.nickname ?? 'Mujo Ritual — Subscribe & Save (4-week)',
  ...(oldPrice.tax_behavior && oldPrice.tax_behavior !== 'unspecified'
    ? { tax_behavior: oldPrice.tax_behavior }
    : {}),
  recurring: { interval: 'week', interval_count: 4 },
  metadata: { ...oldPrice.metadata, replaces: oldId, cadence: '4-week' },
});
console.log(`  ✓ Created new price: ${newPrice.id} (${newPrice.unit_amount}¢ every 4 weeks)`);

await stripe.prices.update(oldId, { active: false });
console.log(`  ✓ Archived old price: ${oldId} (active: false)`);

writeEnvVar(ENV_PATH, ENV_KEY, newPrice.id);
console.log(`  ✓ Updated ${ENV_KEY} in ${ENV_PATH} → ${newPrice.id}`);

console.log('\nDone. NOTE: NEXT_PUBLIC_* env vars must also be updated in Vercel');
console.log('(Production + Preview) before this takes effect on the deployed site.');
