// POST /api/account/subscription/send-gift
//
// Body: {
//   shippingAddress: { recipientName, line1, line2?, city, state, postalCode },
//   giftMessage?: string
// }
//
// Creates an off-session PaymentIntent against the customer's saved card,
// charging the customer at their subscriber rate (current sub's
// effective per-delivery price = unit_amount × (1 - coupon.percent_off / 100)).
// Shipping address is set on the PI — the existing
// payment_intent.succeeded webhook handler reads `pi.shipping` for
// Shopify order creation, so the gift box ships to the recipient
// automatically without handler changes.
//
// The customer's main subscription is unaffected — this is a one-time
// PaymentIntent, not a sub-mgmt action.

import { after, type NextRequest } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { createHash } from "node:crypto";
import { customers, db, subscriptions } from "db";
import { stripe } from "lib/stripe";
import { publicStripeMessage } from "lib/public-error";
import { getSession } from "lib/session";
import { addGiftRecipientIfNew } from "lib/klaviyo";
import { resolvePriceId } from "lib/cart/price-id-map";
import { RITUAL_PRICE_IDS } from "lib/stripe-constants";

export const dynamic = "force-dynamic";

const ACTIVE_SUB_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "paused",
] as const;

const requestSchema = z.object({
  /**
   * Stripe Price ID of the SKU being gifted. Customer chooses in the gift
   * modal — defaults to their current sub's Price but can swap to any
   * other allowed Mujo subscription Price (e.g., Ritual 10-serving when
   * they're on Ritual 25-serving). Validated server-side against an
   * allowlist of Mujo's known subscription Prices.
   */
  priceId: z.string().startsWith("price_"),
  shippingAddress: z.object({
    recipientName: z.string().min(1).max(120),
    line1: z.string().min(1).max(200),
    line2: z.string().max(200).optional(),
    city: z.string().min(1).max(120),
    state: z.string().length(2),
    postalCode: z.string().regex(/^\d{5}(-\d{4})?$/),
  }),
  /**
   * Where Shopify shipping confirmation + tracking emails go. Customer
   * picks: their own email (so they forward) or the recipient's email
   * (so the recipient gets the surprise reveal directly). Required.
   */
  recipientEmail: z.string().email().toLowerCase(),
  giftMessage: z.string().max(250).optional(),
});

/**
 * Allowed gift Price IDs. Customer can only gift Mujo subscription Prices —
 * not retail one-time Prices (member rate is a subscriber benefit) and not
 * arbitrary Stripe Prices (defense against tampered request bodies).
 * 10-serving is one-time only, so it's never giftable.
 */
const ALLOWED_GIFT_PRICE_IDS: Set<string> = new Set(
  [
    RITUAL_PRICE_IDS["25-subscription"],
  ].filter((id) => id.length > 0),
);

// A gift is an immediate charge on the saved card, so it gets two guards:
//  - the same gift sent twice within a few minutes (double tap, retry after a
//    slow response) is charged once;
//  - a daily ceiling, so a stolen session cannot run up charges.
const SAME_GIFT_WINDOW_SECONDS = 10 * 60;
const MAX_GIFTS_PER_DAY = 3;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      {
        error: "invalid_body",
        details: err instanceof z.ZodError ? err.issues : String(err),
      },
      { status: 400 },
    );
  }

  // Find the customer's active subscription — that's where we get the SKU
  // (Stripe Price ID) and the discount percent for the gift charge.
  const [customerRow, subRows] = await Promise.all([
    db
      .select()
      .from(customers)
      .where(eq(customers.id, session.customerId))
      .limit(1),
    db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.customerId, session.customerId),
          inArray(subscriptions.status, [...ACTIVE_SUB_STATUSES]),
        ),
      )
      .orderBy(desc(subscriptions.createdAt))
      .limit(1),
  ]);

  const customer = customerRow[0];
  const subRow = subRows[0];
  if (!customer?.stripeCustomerId) {
    return Response.json(
      {
        error: "no_stripe_customer",
        message: "Need a saved card before you can send a gift.",
      },
      { status: 400 },
    );
  }
  if (!subRow) {
    return Response.json(
      {
        error: "no_active_subscription",
        message:
          "Need an active subscription so we know which SKU to send + your member rate.",
      },
      { status: 400 },
    );
  }

  // Validate the customer-chosen Price ID against the allowlist before any
  // Stripe call. Defense against tampered request bodies trying to gift at
  // an arbitrary (or zero-amount) Price.
  if (!ALLOWED_GIFT_PRICE_IDS.has(parsed.priceId)) {
    return Response.json(
      {
        error: "invalid_price",
        message: "That product isn't available to gift right now.",
      },
      { status: 400 },
    );
  }

  try {
    // Read live state in parallel:
    //   - The customer's active sub (for its default payment method)
    //   - The chosen gift Price (unit_amount + currency — already the member
    //     rate, since the 15% is baked into the subscription Price)
    const [stripeSub, giftPrice] = await Promise.all([
      stripe.subscriptions.retrieve(subRow.stripeSubscriptionId, {
        expand: ["default_payment_method"],
      }),
      stripe.prices.retrieve(parsed.priceId),
    ]);

    if (!giftPrice.unit_amount) {
      return Response.json(
        { error: "no_gift_price" },
        { status: 502 },
      );
    }

    const unitAmountCents = giftPrice.unit_amount;
    const currency = giftPrice.currency ?? "usd";
    const priceId = giftPrice.id;

    // The gift uses a subscription Price, which now has the 15% subscriber rate
    // BAKED IN (mirrored at $55.25, not $65 + coupon). So unit_amount IS the
    // member rate — charge it directly, with no coupon math (applying the
    // customer's coupon on top would double-discount legacy subscribers).
    const effectiveAmountCents = unitAmountCents;

    // Find the saved default payment method. Sub-level overrides customer.
    let paymentMethodId: string | undefined;
    const subPm = stripeSub.default_payment_method;
    if (subPm) {
      paymentMethodId = typeof subPm === "string" ? subPm : subPm.id;
    } else {
      const stripeCustomer = await stripe.customers.retrieve(
        customer.stripeCustomerId,
      );
      if (
        stripeCustomer &&
        !(stripeCustomer as Stripe.DeletedCustomer).deleted
      ) {
        const c = stripeCustomer as Stripe.Customer;
        const defaultPm = c.invoice_settings?.default_payment_method;
        paymentMethodId =
          typeof defaultPm === "string"
            ? defaultPm
            : (defaultPm as Stripe.PaymentMethod | undefined)?.id;
      }
    }

    if (!paymentMethodId) {
      return Response.json(
        {
          error: "no_payment_method",
          message:
            "Add a card on the Payment method page first, then try again.",
        },
        { status: 400 },
      );
    }

    // Sales tax, worked out by Stripe Tax for the address the gift ships to,
    // exactly as checkout does for every other order. Until 2026-11-23 a gift
    // was charged at the bare price with no tax at all.
    const shipTo = {
      line1: parsed.shippingAddress.line1,
      line2: parsed.shippingAddress.line2,
      city: parsed.shippingAddress.city,
      state: parsed.shippingAddress.state,
      postal_code: parsed.shippingAddress.postalCode,
      country: "US",
    };
    let taxCalculation: Stripe.Tax.Calculation;
    try {
      taxCalculation = await stripe.tax.calculations.create({
        currency,
        line_items: [
          {
            amount: effectiveAmountCents,
            reference: "gift",
            tax_behavior: "exclusive",
            ...(typeof giftPrice.product === "string"
              ? { product: giftPrice.product }
              : {}),
          },
        ],
        customer_details: { address: shipTo, address_source: "shipping" },
      });
    } catch (err) {
      console.error("[send-gift] tax calculation failed", err);
      return Response.json(
        {
          error: "tax_unavailable",
          message:
            "We couldn't work out sales tax for that address. Please check the address and try again.",
        },
        { status: 400 },
      );
    }
    const totalCents = taxCalculation.amount_total;
    // Carried on the payment so the Shopify order shows the same tax lines.
    const giftTaxes = (taxCalculation.tax_breakdown ?? [])
      .filter((b) => b.amount > 0)
      .map((b) => ({
        t: `${b.tax_rate_details?.state ?? ""} Sales Tax`.trim(),
        r: Number(b.tax_rate_details?.percentage_decimal ?? 0),
        a: b.amount,
      }));

    // What makes two requests "the same gift": same product, same recipient,
    // same address, same note.
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify([
          priceId,
          parsed.recipientEmail,
          parsed.shippingAddress,
          parsed.giftMessage ?? "",
        ]),
      )
      .digest("hex")
      .slice(0, 32);
    const nowSec = Math.floor(Date.now() / 1000);

    const recent = await stripe.paymentIntents.list({
      customer: customer.stripeCustomerId,
      created: { gte: nowSec - 24 * 60 * 60 },
      limit: 100,
    });
    const recentGifts = recent.data.filter(
      (p) =>
        p.metadata?.gift_order === "true" &&
        (p.status === "succeeded" || p.status === "processing"),
    );
    const sameGift = recentGifts.find(
      (p) =>
        p.metadata?.gift_fingerprint === fingerprint &&
        nowSec - p.created < SAME_GIFT_WINDOW_SECONDS,
    );
    if (sameGift) {
      // Already charged a moment ago: report success, charge nothing more.
      console.warn("[send-gift] repeat of a gift just sent, not charging again", {
        paymentIntentId: sameGift.id,
      });
      return Response.json({ ok: true, paymentIntentId: sameGift.id });
    }
    if (recentGifts.length >= MAX_GIFTS_PER_DAY) {
      return Response.json(
        {
          error: "gift_limit_reached",
          message:
            "That's the most gifts we can send in one day from your account. Email hello@mujoworld.com and we'll help with more.",
        },
        { status: 429 },
      );
    }

    // The key and everything sent with it must be identical for two copies of
    // the same request, or Stripe rejects the second instead of merging it. So
    // the analytics event id is derived from the key, not random.
    const idempotencyKey = `gift-${session.customerId}-${fingerprint}-${paymentMethodId}-${Math.floor(nowSec / SAME_GIFT_WINDOW_SECONDS)}`;
    const eventId = createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32);

    // Create + confirm off-session. Stripe charges the saved card immediately.
    // The idempotency key covers two identical requests arriving at the same
    // instant (both would pass the check above): Stripe runs only one.
    const pi = await stripe.paymentIntents.create({
      amount: totalCents,
      currency,
      customer: customer.stripeCustomerId,
      payment_method: paymentMethodId,
      off_session: true,
      confirm: true,
      receipt_email: session.email,
      shipping: {
        name: parsed.shippingAddress.recipientName,
        address: {
          line1: parsed.shippingAddress.line1,
          line2: parsed.shippingAddress.line2,
          city: parsed.shippingAddress.city,
          state: parsed.shippingAddress.state,
          postal_code: parsed.shippingAddress.postalCode,
          country: "US",
        },
      },
      // Metadata that the existing payment_intent.succeeded webhook handler
      // reads. `line_items` makes the handler treat this as a one-time order
      // (not a sub invoice PI). `gift_*` fields are for analytics +
      // fulfillment flag. `gift_recipient_email` is what the handler uses
      // for the Shopify order's email field, so shipping confirmation +
      // tracking emails route to the customer-chosen address.
      metadata: {
        mujo_event_id: eventId,
        line_items: JSON.stringify([{ price: priceId, quantity: 1 }]),
        gift_order: "true",
        gift_fingerprint: fingerprint,
        gift_subtotal_cents: String(effectiveAmountCents),
        gift_taxes: JSON.stringify(giftTaxes).slice(0, 480),
        tax_calculation: taxCalculation.id ?? "",
        gift_message: parsed.giftMessage ?? "",
        gift_sender_email: session.email,
        gift_recipient_email: parsed.recipientEmail,
      },
    },
    {
      idempotencyKey,
    });

    if (pi.status === "succeeded") {
      console.log("[send-gift] PaymentIntent succeeded", {
        paymentIntentId: pi.id,
        recipient: parsed.shippingAddress.recipientName,
        amount: totalCents,
        tax: totalCents - effectiveAmountCents,
      });

      // Fire-and-forget: capture the recipient email into the gift-recipient
      // Klaviyo list IF they're not already in any Mujo list. Powers a
      // "How was your gift?" follow-up flow without spamming returning
      // customers. Never blocks the response.
      const meta = resolvePriceId(priceId, { isSubscription: true });
      const productLabel = meta
        ? `${meta.productTitle} · ${meta.variantTitle.replace(" · Subscribe & save", "").replace(" · One-time", "")}`
        : "Mujo product";
      // after(): runs once the response is sent and keeps the function alive
      // until it finishes (a bare fire-and-forget call is cut off on serverless).
      after(() =>
        addGiftRecipientIfNew({
          email: parsed.recipientEmail,
          giftedByEmail: session.email,
          giftedProduct: productLabel,
          giftMessage: parsed.giftMessage,
        }).catch((err) =>
          console.error("[send-gift] gift recipient capture failed", err),
        ),
      );

      return Response.json({ ok: true, paymentIntentId: pi.id });
    }

    if (pi.status === "requires_action") {
      // 3DS required — off-session can't complete without customer present.
      // Fall back: tell the customer to update the card or try a different
      // flow. (For Mujo this is rare on saved Visa/MC cards in the US.)
      return Response.json(
        {
          error: "requires_action",
          message:
            "Your bank requires extra verification for this charge. Try a different card or send the gift via the standard checkout.",
        },
        { status: 402 },
      );
    }

    return Response.json(
      {
        error: pi.status,
        message: `Payment ${pi.status}. Please try again or use a different card.`,
      },
      { status: 502 },
    );
  } catch (err) {
    // Two copies of the same request arrived at the same instant and Stripe is
    // still working on the first: the gift is being sent once, which is what
    // the customer wanted.
    if (err instanceof Stripe.errors.StripeIdempotencyError) {
      console.warn("[send-gift] duplicate request while the first is in flight");
      return Response.json({ ok: true });
    }
    if (err instanceof Stripe.errors.StripeError) {
      // authentication_required, card_declined, etc.
      console.error("[send-gift] Stripe error", {
        code: err.code,
        message: err.message,
      });
      return Response.json(
        {
          error: err.code ?? "stripe_error",
          message:
            err.code === "authentication_required"
              ? "Your bank requires extra verification. Try a different card."
              : err.code === "card_declined"
                ? "Your saved card was declined. Try updating it."
                : publicStripeMessage(err),
        },
        { status: err.statusCode ?? 502 },
      );
    }
    console.error("[send-gift] unexpected error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
