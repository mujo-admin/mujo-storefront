// scripts/create-duo-coupons.mjs
//
// Black Friday 2026, the Daily Ritual Duo (lib/duo-offer.ts). Creates the two
// Stripe coupons the checkout applies by itself:
//   - DAILY_RITUAL_DUO           : $16 off, once  (one-time pair: $105 -> $89)
//   - DAILY_RITUAL_DUO_SUBSCRIBE : $21 off, once  (first delivery of both
//                                  subscriptions: $90 -> $69; later ones $90)
// No promotion codes: nobody types anything. The checkout decides who gets
// them, so they carry no restrictions of their own, only an end date after
// which Stripe refuses them (a second lock next to the one in the code).
//
// Idempotent. Run once per Stripe account, BEFORE setting
// NEXT_PUBLIC_DUO_OFFER_ENABLED=true there.
//
// Usage:  node scripts/create-duo-coupons.mjs [--env=.env.live] [--dry-run]

import Stripe from "stripe";
import fs from "fs";

const DRY = process.argv.includes("--dry-run");
const envFile = (
  process.argv.find((a) => a.startsWith("--env=")) ?? "--env=.env.local"
).slice(6);

// A little after the offer ends in the code (Dec 1, 07:59:59 UTC), so a
// checkout opened in the last minutes can still be paid.
const REDEEM_BY = Math.floor(Date.UTC(2026, 11, 1, 10, 0, 0) / 1000);

const COUPONS = [
  { id: "DAILY_RITUAL_DUO", name: "Daily Ritual Duo", amount_off: 1600 },
  {
    id: "DAILY_RITUAL_DUO_SUBSCRIBE",
    name: "Daily Ritual Duo, first delivery",
    amount_off: 2100,
  },
];

const env = {};
for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-04-22.dahlia",
});
const MODE = env.STRIPE_SECRET_KEY.startsWith("sk_test") ? "TEST" : "LIVE";
console.log(`MODE: ${MODE} (${envFile})${DRY ? "  (dry-run)" : ""}\n`);

for (const c of COUPONS) {
  try {
    const existing = await stripe.coupons.retrieve(c.id);
    console.log(
      `✓ exists: ${existing.id} | $${(existing.amount_off ?? 0) / 100} off | ${existing.duration} | valid: ${existing.valid}`,
    );
    if (existing.amount_off !== c.amount_off || existing.duration !== "once") {
      console.log(
        "  ! amount or duration differs from this script. Delete it in Stripe and re-run.",
      );
      process.exitCode = 1;
    }
    continue;
  } catch (e) {
    if (e?.code !== "resource_missing") throw e;
  }
  if (DRY) {
    console.log(
      `[dry-run] would create ${c.id}: $${c.amount_off / 100} off, once`,
    );
    continue;
  }
  const made = await stripe.coupons.create({
    id: c.id,
    name: c.name,
    amount_off: c.amount_off,
    currency: "usd",
    duration: "once",
    redeem_by: REDEEM_BY,
  });
  console.log(
    `✓ created: ${made.id} | $${made.amount_off / 100} off | ${made.duration}`,
  );
}
