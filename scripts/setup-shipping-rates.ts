// scripts/setup-shipping-rates.ts
//
// Ensures the three Mujo shipping rates exist in Stripe with plain, never-stale
// display names, and prints the env lines to set. Idempotent — reuses an
// existing rate that already matches (display_name + amount + currency).
//
// Why a fresh script (not the mirror): Stripe shipping-rate display_name is
// IMMUTABLE, so de-staling the old "Free shipping (orders $50+)" label means
// creating new rates and repointing the env IDs. This script does only that —
// no Shopify Admin dependency, just STRIPE_SECRET_KEY.
//
// Usage:
//   pnpm tsx --env-file=.env.local scripts/setup-shipping-rates.ts
//
// After running: copy the printed STRIPE_SHIPPING_* lines into .env.local AND
// Vercel Production (Settings → Environment Variables), then redeploy. Run once
// against the sandbox key now, and again against the LIVE key at cutover.

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY not set');
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

type RateSpec = {
  envKey: string;
  displayName: string;
  amountCents: number;
  minDay: number;
  maxDay: number;
};

const RATES: RateSpec[] = [
  { envKey: 'STRIPE_SHIPPING_FREE_ID', displayName: 'Free shipping', amountCents: 0, minDay: 3, maxDay: 7 },
  { envKey: 'STRIPE_SHIPPING_FLAT_ID', displayName: 'Standard shipping', amountCents: 500, minDay: 3, maxDay: 7 },
  { envKey: 'STRIPE_SHIPPING_EXPRESS_ID', displayName: 'Express shipping', amountCents: 1500, minDay: 1, maxDay: 2 },
];

async function ensureRate(spec: RateSpec): Promise<string> {
  const list = await stripe.shippingRates.list({ active: true, limit: 100 });
  const existing = list.data.find(
    (r) =>
      r.display_name === spec.displayName &&
      r.fixed_amount?.amount === spec.amountCents &&
      r.fixed_amount?.currency === 'usd',
  );
  if (existing) {
    console.log(`  = reused ${spec.displayName}: ${existing.id}`);
    return existing.id;
  }
  const created = await stripe.shippingRates.create({
    display_name: spec.displayName,
    type: 'fixed_amount',
    fixed_amount: { amount: spec.amountCents, currency: 'usd' },
    tax_behavior: 'exclusive',
    delivery_estimate: {
      minimum: { unit: 'business_day', value: spec.minDay },
      maximum: { unit: 'business_day', value: spec.maxDay },
    },
  });
  console.log(`  + created ${spec.displayName}: ${created.id}`);
  return created.id;
}

async function main() {
  const mode = process.env.STRIPE_SECRET_KEY!.startsWith('sk_live') ? 'LIVE' : 'TEST/SANDBOX';
  console.log(`Setting up Mujo shipping rates (${mode})…\n`);

  const env: Record<string, string> = {};
  for (const spec of RATES) {
    env[spec.envKey] = await ensureRate(spec);
  }

  console.log('\n--- Set these in .env.local AND Vercel Production, then redeploy ---');
  for (const spec of RATES) {
    console.log(`${spec.envKey}=${env[spec.envKey]}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
