// scripts/loop-migration-payment-link.ts
//
// Phase 6 test-mode prep: creates a Stripe Payment Link for the Mujo Ritual
// 25-serving subscription (with MUJO_SUB_15 coupon attached) and prints
// the 5 per-customer URLs to use in the Loop → Stripe migration emails
// drafted at outputs/marketing-and-sales/emails/_loop-to-stripe-migration-2026-05-07.md.
//
// Idempotent: looks for an existing Payment Link tagged
// `metadata.loop_migration === '<RUN_TAG>'`. If found, updates its
// after_completion.redirect.url to the current --site-url. If not,
// creates a fresh one. This means re-running with a different
// --site-url repoints the same Payment Link (same plink_… ID) at the
// new redirect URL — useful if .env.local's NEXT_PUBLIC_SITE_URL is
// localhost (good for dev, useless for Stripe redirects).
//
// Test mode only — runs against `sk_test_…` from .env.local. No live
// charges.
//
// Usage:
//   pnpm tsx --env-file=.env.local scripts/loop-migration-payment-link.ts \
//     --site-url=https://mujo-storefront.vercel.app
//
// Output: 5 per-customer URLs printed to stdout.

import "dotenv/config";
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });

import Stripe from "stripe";

const SECRET = process.env.STRIPE_SECRET_KEY;
if (!SECRET) {
  console.error("STRIPE_SECRET_KEY not set");
  process.exit(1);
}
if (!SECRET.startsWith("sk_test_")) {
  console.error(
    `Refusing to run: STRIPE_SECRET_KEY must be a test-mode key (sk_test_…), got ${SECRET.slice(0, 8)}…`,
  );
  process.exit(1);
}

const stripe = new Stripe(SECRET, {
  apiVersion: "2026-04-22.dahlia",
});

const PRICE_ID = process.env.NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION;
const COUPON_ID = process.env.STRIPE_SUBSCRIPTION_COUPON_ID;
if (!PRICE_ID) {
  console.error("NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION not set");
  process.exit(1);
}

// Same 5 customers from outputs/marketing-and-sales/emails/_loop-to-stripe-migration-2026-05-07.md
const SUBSCRIBERS: Array<{ name: string; email: string }> = [
  { name: "Magdalena", email: "tolafe@gmail.com" },
  { name: "David", email: "davidmperry@gmail.com" },
  { name: "Maria", email: "mvasiliadis20@gmail.com" },
  { name: "Charles", email: "charles3christian@gmail.com" },
  { name: "Silja", email: "silja.v.kim@gmail.com" },
];

const RUN_TAG = "v2-2026-05-08-test-with-redirect";

// CLI: --site-url=<url> is required. Stripe redirects there after the
// customer completes the migration Payment Link checkout.
// /migration-complete is a Mujo-side server component that confirms
// the migration + hands off to /account/login with email pre-filled.
// {CHECKOUT_SESSION_ID} is Stripe-substituted.
//
// Required as a CLI flag (NOT defaulted to NEXT_PUBLIC_SITE_URL)
// because that env var is typically `http://localhost:3000` in
// .env.local for local dev — and a localhost redirect URL would
// silently break the Stripe checkout flow (browser can't reach
// localhost from outside).
const argv = process.argv.slice(2);
const siteUrlArg = argv.find((a) => a.startsWith("--site-url="));
if (!siteUrlArg) {
  console.error(
    "Required: --site-url=https://<your-deployed-domain>\n" +
      "  Test mode example:  --site-url=https://mujo-storefront.vercel.app\n" +
      "  Cutover example:    --site-url=https://mujoworld.com\n" +
      "  (do not use localhost — Stripe needs a public URL it can redirect to)",
  );
  process.exit(1);
}
const SITE_URL = siteUrlArg.split("=")[1]?.replace(/\/$/, "") ?? "";
if (!SITE_URL.startsWith("https://")) {
  console.error(
    `Invalid --site-url: ${SITE_URL}\n` +
      "Must start with https:// — Stripe rejects http (non-TLS) redirect URLs.",
  );
  process.exit(1);
}
const REDIRECT_URL = `${SITE_URL}/migration-complete?session_id={CHECKOUT_SESSION_ID}`;

async function main() {
  console.log("→ Phase 6 test-mode Payment Link prep");
  console.log(`  Stripe key: ${SECRET!.slice(0, 8)}… (test mode)`);
  console.log(`  Subscription Price: ${PRICE_ID}`);
  console.log(`  Coupon: ${COUPON_ID || "(none — full retail)"}`);
  console.log();

  console.log(`  Site URL: ${SITE_URL}`);
  console.log(`  Redirect URL: ${REDIRECT_URL}`);
  console.log();

  // 1. Look for an existing tagged Payment Link. If found and its current
  //    redirect URL matches → reuse. If found but redirect points at a
  //    different URL (e.g. previous run used localhost by mistake) →
  //    update via stripe.paymentLinks.update so the same plink_… ID
  //    keeps working.
  let paymentLink: Stripe.PaymentLink | null = null;
  const existing = await stripe.paymentLinks.list({ limit: 100, active: true });
  for (const pl of existing.data) {
    if (pl.metadata?.loop_migration === RUN_TAG) {
      paymentLink = pl;
      const currentRedirect =
        pl.after_completion?.type === "redirect"
          ? (pl.after_completion.redirect?.url ?? null)
          : null;
      if (currentRedirect === REDIRECT_URL) {
        console.log(`  Reusing existing Payment Link: ${pl.id} (redirect already current)`);
      } else {
        console.log(`  Found existing Payment Link: ${pl.id}`);
        console.log(`  Current redirect: ${currentRedirect ?? "(none)"}`);
        console.log(`  Updating redirect → ${REDIRECT_URL}`);
        paymentLink = await stripe.paymentLinks.update(pl.id, {
          after_completion: {
            type: "redirect",
            redirect: { url: REDIRECT_URL },
          },
        });
        console.log(`  ✓ Redirect updated`);
      }
      break;
    }
  }

  // 2. Otherwise create a fresh one.
  if (!paymentLink) {
    console.log("  Creating new Payment Link…");
    const params: Stripe.PaymentLinkCreateParams = {
      line_items: [{ price: PRICE_ID!, quantity: 1 }],
      metadata: {
        loop_migration: RUN_TAG,
        purpose: "Migrate Loop subs to Stripe at MUJO_SUB_15 rate",
      },
      // Subscription line items use subscription_data for sub-level config
      subscription_data: {
        metadata: { loop_migration: RUN_TAG },
      },
      // Mujo-only US shipping
      shipping_address_collection: { allowed_countries: ["US"] },
      // Redirect to Mujo-side confirmation page after checkout instead of
      // Stripe's default Stripe-branded thank-you. The page hands the
      // customer off to /account/login (email pre-filled) so they can
      // start managing their sub immediately.
      after_completion: {
        type: "redirect",
        redirect: { url: REDIRECT_URL },
      },
    };

    // Stripe Payment Link API: discounts go on `restrictions`? No — discounts
    // go on `subscription_data` for subscriptions. Setting via
    // `subscription_data.discounts` would auto-apply the coupon to the sub.
    // But Payment Links don't support subscription_data.discounts directly
    // on create — coupons attach via the URL param `?prefilled_promo_code`
    // OR via Customer-level discounts post-creation.
    //
    // Cleanest path for member-rate honoring: customers click through, the
    // Customer is created, then the post-checkout webhook attaches the
    // MUJO_SUB_15 coupon to their Customer record. That's outside this
    // script's scope — Kinga can also manually create a custom coupon at
    // each customer's old Loop rate, per the migration draft's note.
    //
    // For TEST validation, we just want clickable URLs that reach Stripe
    // Checkout. Coupon plumbing is a Phase-8 (cutover-day) concern.

    paymentLink = await stripe.paymentLinks.create(params);
    console.log(`  ✓ Created Payment Link: ${paymentLink.id}`);
  }

  // 3. Compose per-customer URLs.
  console.log();
  console.log("┌─────────────────────────────────────────────────────────────");
  console.log("│ PER-CUSTOMER URLs (paste into {{PAYMENT_LINK}} placeholders)");
  console.log("├─────────────────────────────────────────────────────────────");

  const baseUrl = paymentLink.url;
  for (const sub of SUBSCRIBERS) {
    const personalUrl = `${baseUrl}?prefilled_email=${encodeURIComponent(sub.email)}`;
    console.log("│");
    console.log(`│ ${sub.name.padEnd(10)} → ${sub.email}`);
    console.log(`│ ${personalUrl}`);
  }

  console.log("│");
  console.log("└─────────────────────────────────────────────────────────────");
  console.log();
  console.log("Next steps:");
  console.log("  1. Click any URL above to verify the Stripe Checkout page loads");
  console.log("     with the email pre-filled and Mujo Ritual 25-serving sub queued.");
  console.log(`     Use test card 4242 4242 4242 4242 to walk through end-to-end.`);
  console.log("  2. Inspect the Stripe Dashboard (Sandbox view) → Payments to see the");
  console.log("     test-mode charges + the resulting test Subscription objects.");
  console.log("  3. When ready for cutover, re-run this script with sk_live_… set in");
  console.log("     .env.local — it'll create a NEW Payment Link in live mode (the");
  console.log("     RUN_TAG keys idempotency to test mode only).");
  console.log("  4. Paste the LIVE per-customer URLs into the {{PAYMENT_LINK}}");
  console.log("     placeholders in outputs/marketing-and-sales/emails/");
  console.log("     _loop-to-stripe-migration-2026-05-07.md and send via Gmail compose.");
  console.log();

  // Coupon attachment heads-up
  if (!COUPON_ID) {
    console.warn(
      "⚠ STRIPE_SUBSCRIPTION_COUPON_ID not set — Payment Link will charge full retail.",
    );
  } else {
    console.log(
      `Note: MUJO_SUB_15 coupon (${COUPON_ID}) is set in env but Payment Links don't auto-apply it.\nCustomers will need to enter the promo code manually OR you can attach it post-checkout via webhook.\n(Per migration-draft note: per-customer custom coupon at their old Loop rate is the policy.)`,
    );
  }
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
