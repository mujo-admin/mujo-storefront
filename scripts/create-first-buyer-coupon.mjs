// scripts/create-first-buyer-coupon.mjs
//
// Creates the "first buyer" acquisition discount:
//   - Coupon  MUJO_FIRST_10 : 10% off, duration 'once' (discounts a single
//     payment only — on a subscription that's the first cycle).
//   - Promotion Code WELCOME10 : customer-enterable code wrapping the coupon,
//     restricted to first-time customers (no prior successful payment).
//
// This is SEPARATE from MUJO_SUB_15 (the always-on Subscribe & Save 15%,
// duration 'forever'), which is untouched.
//
// Dahlia API: a PromotionCode wraps a Coupon under `promotion.coupon`
// (not the pre-dahlia top-level `coupon` field).
//
// Idempotent + re-runnable (test now, live at cutover). Re-running reuses the
// existing coupon/code if present.
//
// Usage:  node scripts/create-first-buyer-coupon.mjs
//         node scripts/create-first-buyer-coupon.mjs --dry-run

import Stripe from 'stripe';
import fs from 'fs';

const COUPON_ID = 'MUJO_FIRST_10';
const COUPON_NAME = 'First Order 10% Off';
const PERCENT_OFF = 10;
const PROMO_CODE = 'WELCOME10';
const DRY = process.argv.includes('--dry-run');

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2026-04-22.dahlia' });
const MODE = env.STRIPE_SECRET_KEY.startsWith('sk_test') ? 'TEST' : 'LIVE';
console.log(`MODE: ${MODE}${DRY ? '  (dry-run)' : ''}\n`);

// 1) Coupon (fixed id so re-runs are idempotent)
let coupon;
try {
  coupon = await stripe.coupons.retrieve(COUPON_ID);
  console.log(`✓ Coupon exists: ${coupon.id} | ${coupon.percent_off}% | duration: ${coupon.duration}`);
} catch (e) {
  if (e?.code !== 'resource_missing') throw e;
  if (DRY) {
    console.log(`[dry-run] Would create coupon ${COUPON_ID}: ${PERCENT_OFF}% off, duration 'once'.`);
  } else {
    coupon = await stripe.coupons.create({
      id: COUPON_ID,
      name: COUPON_NAME,
      percent_off: PERCENT_OFF,
      duration: 'once',
    });
    console.log(`✓ Created coupon: ${coupon.id} | ${coupon.percent_off}% | duration: ${coupon.duration}`);
  }
}

// 2) Promotion Code restricted to first-time customers
const existing = await stripe.promotionCodes.list({ code: PROMO_CODE, limit: 100 });
const match = existing.data.find((pc) => {
  const ref = pc.promotion?.coupon;
  const cid = typeof ref === 'string' ? ref : ref?.id;
  return cid === COUPON_ID && pc.active;
});

if (match) {
  console.log(`✓ Promo code exists: ${match.code} (id: ${match.id}, active: ${match.active}, first_time_only: ${match.restrictions?.first_time_transaction})`);
} else if (DRY) {
  console.log(`[dry-run] Would create promo code ${PROMO_CODE} wrapping ${COUPON_ID}, first_time_transaction: true.`);
} else {
  const pc = await stripe.promotionCodes.create({
    promotion: { coupon: COUPON_ID, type: 'coupon' },
    code: PROMO_CODE,
    active: true,
    restrictions: { first_time_transaction: true },
  });
  console.log(`✓ Created promo code: ${pc.code} (id: ${pc.id}, first_time_only: ${pc.restrictions?.first_time_transaction})`);
}

console.log('\nDone. To let customers enter WELCOME10 at checkout, the Checkout');
console.log("Session must be created with allow_promotion_codes: true (or the code");
console.log('pre-applied via the discounts param). See follow-up note.');
