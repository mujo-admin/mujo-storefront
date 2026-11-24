// scripts/duo-session-check.mjs
//
// Opens test checkouts against a running local storefront (port 3111, Stripe
// test mode) and prints what Stripe would charge, to prove the Daily Ritual
// Duo (lib/duo-offer.ts) applies to the pair and to nothing else.
// Opens sessions only: nothing is paid and no order is created.
//
// Usage:  node scripts/duo-session-check.mjs   (reads .env.local)

import Stripe from "stripe";
import fs from "fs";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (!env.STRIPE_SECRET_KEY?.startsWith("sk_test")) {
  console.error("Refusing to run: .env.local is not a Stripe test key.");
  process.exit(1);
}
const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-04-22.dahlia",
});
const BASE = process.env.DUO_CHECK_BASE ?? "http://localhost:3111";

const R1 = env.NEXT_PUBLIC_RITUAL_PRICE_25_ONETIME;
const P1 = env.NEXT_PUBLIC_PROTEIN_PRICE_ONETIME;
const RS = env.NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION;
const PS = env.NEXT_PUBLIC_PROTEIN_PRICE_SUB_4W;
const TEE = env.NEXT_PUBLIC_MERCH_TEE_WHITE_M;

// [name, lines as [priceId, quantity, isSubscription], expected discount in cents]
const CASES = [
  [
    "duo one-time",
    [
      [R1, 1, false],
      [P1, 1, false],
    ],
    1600,
  ],
  [
    "duo one-time + 2nd Ritual",
    [
      [R1, 2, false],
      [P1, 1, false],
    ],
    1600,
  ],
  [
    "duo one-time + tee",
    [
      [R1, 1, false],
      [P1, 1, false],
      [TEE, 1, false],
    ],
    1600,
  ],
  ["Ritual alone", [[R1, 1, false]], 0],
  ["Powder alone", [[P1, 1, false]], 0],
  [
    "duo subscribe (both 4wk)",
    [
      [RS, 1, true],
      [PS, 1, true],
    ],
    2100,
  ],
  [
    "Ritual sub + Powder once",
    [
      [RS, 1, true],
      [P1, 1, false],
    ],
    0,
  ],
  ["Ritual sub alone", [[RS, 1, true]], 0],
  ["Powder sub alone", [[PS, 1, true]], 0],
];

let failed = 0;
for (const [name, lines, expected] of CASES) {
  const res = await fetch(`${BASE}/api/checkout-session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      items: lines.map(([stripePriceId, quantity, isSubscription]) => ({
        stripePriceId,
        quantity,
        isSubscription,
      })),
      origin: BASE,
      trackingDeclined: true,
    }),
  });
  const json = await res.json();
  if (!json.sessionId) {
    failed++;
    console.log(
      name.padEnd(28),
      "ERROR",
      res.status,
      JSON.stringify(json).slice(0, 220),
    );
    continue;
  }
  const s = await stripe.checkout.sessions.retrieve(json.sessionId, {
    expand: ["line_items", "shipping_options.shipping_rate"],
  });
  const ship =
    (s.shipping_options ?? [])
      .map((o) => `${o.shipping_rate.display_name} $${o.shipping_amount / 100}`)
      .join(" | ") || "none (subscription ships free)";
  const discount = s.total_details?.amount_discount ?? 0;
  const ok =
    discount === expected && !!s.allow_promotion_codes === (expected === 0);
  if (!ok) failed++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${name.padEnd(28)} ${s.mode.padEnd(12)} items $${s.amount_subtotal / 100}  discount $${discount / 100}  total $${s.amount_total / 100}  promo box: ${s.allow_promotion_codes ? "yes" : "no"}  shipping: ${ship}`,
  );
  console.log(
    " ".repeat(34) +
      s.line_items.data
        .map(
          (l) => `${l.quantity}x ${l.description} $${l.amount_subtotal / 100}`,
        )
        .join(" ; "),
  );
}
console.log(failed ? `\n${failed} problem(s)` : "\nall as expected");
process.exit(failed ? 1 : 0);
