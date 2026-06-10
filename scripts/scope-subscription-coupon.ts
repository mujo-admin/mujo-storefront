// scripts/scope-subscription-coupon.ts
//
// Creates a PRODUCT-SCOPED twin of the 15% subscriber coupon (MUJO_SUB_15),
// restricted to the Ritual subscription product via applies_to.products, so a
// MIXED cart (Ritual subscription + a one-time merch add-on) discounts only the
// subscription line and never the merch.
//
// WHY a twin (not an edit): Stripe Coupon.applies_to is IMMUTABLE — you cannot
// scope an existing coupon. So we mint a new coupon `MUJO_SUB_15_RITUAL`.
//
// WHY a new env var (not a repoint of STRIPE_SUBSCRIPTION_COUPON_ID): the Loop
// migration path (Payment Link promo LOOPMIG2026 + the subscription-created
// webhook's attachMigrationCoupon) is keyed to the ORIGINAL MUJO_SUB_15.
// Repointing STRIPE_SUBSCRIPTION_COUPON_ID would make the webhook re-attach the
// new coupon on top of the old one a migrating sub already carries → DOUBLE
// discount. So MUJO_SUB_15 stays as-is for migration (those carts are Ritual-
// sub-only, so unscoped is harmless), and the checkout routes use the scoped
// twin via a new var STRIPE_SUBSCRIPTION_COUPON_RITUAL_ID.
//
// Usage:
//   pnpm tsx scripts/scope-subscription-coupon.ts            # DRY RUN (reports only)
//   pnpm tsx scripts/scope-subscription-coupon.ts --apply    # create the coupon
//
// After --apply:
//   1. Add the printed STRIPE_SUBSCRIPTION_COUPON_RITUAL_ID to .env.local + Vercel.
//   2. Wire the checkout routes to prefer it (see printed note) — one-line change
//      in app/api/checkout-session/route.ts and app/api/checkout/route.ts.
//   Run against sandbox now; re-run against LIVE at cutover.

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
import Stripe from 'stripe';

const APPLY = process.argv.includes('--apply');
const TWIN_ID = 'MUJO_SUB_15_RITUAL';
const NEW_ENV_KEY = 'STRIPE_SUBSCRIPTION_COUPON_RITUAL_ID';

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY not set');
  process.exit(1);
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SOURCE_COUPON_ID = process.env.STRIPE_SUBSCRIPTION_COUPON_ID;
// Both Ritual subscription cadences live under the same Stripe product, but we
// resolve the product from every known sub Price ID to be safe.
const SUB_PRICE_IDS = [
  process.env.NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION,
  process.env.NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION_8W,
].filter((v): v is string => !!v);

async function resolveRitualProductIds(): Promise<string[]> {
  if (SUB_PRICE_IDS.length === 0) {
    throw new Error(
      'No Ritual subscription Price IDs in env (NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION[_8W]).',
    );
  }
  const products = new Set<string>();
  for (const priceId of SUB_PRICE_IDS) {
    const price = await stripe.prices.retrieve(priceId);
    const productId = typeof price.product === 'string' ? price.product : price.product.id;
    products.add(productId);
  }
  return Array.from(products);
}

function scopeMatches(coupon: Stripe.Coupon, productIds: string[]): boolean {
  const scoped = coupon.applies_to?.products ?? [];
  return (
    scoped.length === productIds.length &&
    productIds.every((p) => scoped.includes(p))
  );
}

async function main() {
  const mode = process.env.STRIPE_SECRET_KEY!.startsWith('sk_live') ? 'LIVE' : 'TEST/SANDBOX';
  console.log(`Scoping subscriber coupon to the Ritual product (${mode})${APPLY ? '' : ' — DRY RUN'}\n`);

  // 1. What is the source coupon (to copy percent_off + duration)?
  if (!SOURCE_COUPON_ID) {
    throw new Error('STRIPE_SUBSCRIPTION_COUPON_ID not set — cannot read the source 15% coupon.');
  }
  const source = await stripe.coupons.retrieve(SOURCE_COUPON_ID);
  console.log(
    `Source coupon ${source.id}: ${source.percent_off ?? source.amount_off}` +
      `${source.percent_off ? '% off' : ' off'}, duration=${source.duration}` +
      (source.duration_in_months ? ` (${source.duration_in_months}mo)` : '') +
      `, applies_to=${JSON.stringify(source.applies_to ?? 'all products')}`,
  );

  // 2. Resolve the Ritual product(s) the scope should target.
  const ritualProductIds = await resolveRitualProductIds();
  console.log(`Ritual subscription product(s): ${ritualProductIds.join(', ')}`);

  // 3. Already scoped at the source? Then nothing to do.
  if (source.applies_to?.products && scopeMatches(source, ritualProductIds)) {
    console.log(`\n✓ ${source.id} is ALREADY scoped to the Ritual product. No new coupon needed.`);
    console.log(`  Set ${NEW_ENV_KEY}=${source.id} (or just keep using it).`);
    return;
  }

  // 4. Does the twin already exist (idempotent)?
  let twin: Stripe.Coupon | null = null;
  try {
    twin = await stripe.coupons.retrieve(TWIN_ID);
  } catch {
    twin = null;
  }

  if (twin) {
    if (scopeMatches(twin, ritualProductIds)) {
      console.log(`\n✓ Scoped twin ${twin.id} already exists and is correctly scoped. Reusing.`);
      printFollowup(twin.id);
      return;
    }
    console.error(
      `\n✗ A coupon '${TWIN_ID}' exists but is scoped to ${JSON.stringify(twin.applies_to?.products ?? 'all')} ` +
        `(expected ${JSON.stringify(ritualProductIds)}). Coupon applies_to is immutable — delete it in the ` +
        `Stripe dashboard, or change TWIN_ID in this script, then re-run.`,
    );
    process.exit(1);
  }

  // 5. Create the scoped twin.
  if (!source.percent_off) {
    throw new Error('Source coupon is not percent_off — adjust this script for amount_off before creating a twin.');
  }
  if (!APPLY) {
    console.log(`\n[DRY RUN] Would create coupon '${TWIN_ID}': ${source.percent_off}% off, ` +
      `duration=${source.duration}, applies_to.products=${JSON.stringify(ritualProductIds)}.`);
    console.log('Re-run with --apply to create it.');
    return;
  }

  const created = await stripe.coupons.create({
    id: TWIN_ID,
    name: 'Mujo Subscriber 15% — Ritual',
    percent_off: source.percent_off,
    duration: source.duration,
    ...(source.duration === 'repeating' && source.duration_in_months
      ? { duration_in_months: source.duration_in_months }
      : {}),
    applies_to: { products: ritualProductIds },
    metadata: { scoped_twin_of: source.id },
  });
  console.log(`\n✓ Created scoped coupon ${created.id} (${created.percent_off}% off, Ritual-only).`);
  printFollowup(created.id);
}

function printFollowup(couponId: string) {
  console.log('\n--- Follow-up ---');
  console.log(`1. Add to .env.local AND Vercel (Preview + Production):`);
  console.log(`   ${NEW_ENV_KEY}=${couponId}`);
  console.log(`2. Code change (one line in each route) — prefer the scoped coupon for direct checkouts:`);
  console.log(`   import: SUBSCRIPTION_COUPON_RITUAL_ID  (new, from stripe-constants)`);
  console.log(`   in the subscription block: const coupon = SUBSCRIPTION_COUPON_RITUAL_ID || SUBSCRIPTION_COUPON_ID;`);
  console.log(`   params.discounts = [{ coupon }];`);
  console.log(`   Files: app/api/checkout-session/route.ts, app/api/checkout/route.ts`);
  console.log(`3. DO NOT repoint STRIPE_SUBSCRIPTION_COUPON_ID — the Loop migration webhook + LOOPMIG2026`);
  console.log(`   promo stay on MUJO_SUB_15 (migration carts are Ritual-sub-only, so unscoped is harmless).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
