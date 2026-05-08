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

import type { NextRequest } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { customers, db, subscriptions } from "db";
import { stripe } from "lib/stripe";
import { getSession } from "lib/session";
import { addGiftRecipientIfNew } from "lib/klaviyo";
import { resolvePriceId } from "lib/cart/price-id-map";

export const dynamic = "force-dynamic";

const ACTIVE_SUB_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "paused",
] as const;

const requestSchema = z.object({
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

  try {
    // Read the live sub for product + coupon. Same expand path as
    // /account/subscription so we get the same effective per-delivery price.
    const stripeSub = await stripe.subscriptions.retrieve(
      subRow.stripeSubscriptionId,
      { expand: ["items.data.price", "discounts.source.coupon"] },
    );
    const item = stripeSub.items.data[0];
    if (!item || !item.price.unit_amount) {
      return Response.json(
        { error: "no_subscription_price" },
        { status: 502 },
      );
    }

    const unitAmountCents = item.price.unit_amount;
    const currency = item.price.currency ?? "usd";
    const priceId = item.price.id;

    // Apply coupon.percent_off (Mujo's MUJO_SUB_15) so gifts charge at the
    // customer's member rate, not retail.
    let effectiveAmountCents = unitAmountCents;
    const firstDiscount = stripeSub.discounts?.[0];
    const discount =
      firstDiscount && typeof firstDiscount === "object"
        ? (firstDiscount as Stripe.Discount)
        : null;
    const couponRef = discount?.source?.coupon;
    const coupon =
      couponRef && typeof couponRef === "object"
        ? (couponRef as Stripe.Coupon)
        : null;
    if (coupon?.percent_off) {
      effectiveAmountCents = Math.round(
        unitAmountCents * (1 - coupon.percent_off / 100),
      );
    } else if (coupon?.amount_off) {
      effectiveAmountCents = Math.max(0, unitAmountCents - coupon.amount_off);
    }

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

    const eventId = randomUUID();

    // Create + confirm off-session. Stripe charges the saved card immediately.
    const pi = await stripe.paymentIntents.create({
      amount: effectiveAmountCents,
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
        gift_message: parsed.giftMessage ?? "",
        gift_sender_email: session.email,
        gift_recipient_email: parsed.recipientEmail,
      },
    });

    if (pi.status === "succeeded") {
      console.log("[send-gift] PaymentIntent succeeded", {
        paymentIntentId: pi.id,
        recipient: parsed.shippingAddress.recipientName,
        amount: effectiveAmountCents,
      });

      // Fire-and-forget: capture the recipient email into the gift-recipient
      // Klaviyo list IF they're not already in any Mujo list. Powers a
      // "How was your gift?" follow-up flow without spamming returning
      // customers. Never blocks the response.
      const meta = resolvePriceId(priceId, { isSubscription: true });
      const productLabel = meta
        ? `${meta.productTitle} · ${meta.variantTitle.replace(" · Subscribe & save", "").replace(" · One-time", "")}`
        : "Mujo product";
      void addGiftRecipientIfNew({
        email: parsed.recipientEmail,
        giftedByEmail: session.email,
        giftedProduct: productLabel,
        giftMessage: parsed.giftMessage,
      }).catch((err) =>
        console.error("[send-gift] gift recipient capture failed", err),
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
                : err.message,
        },
        { status: err.statusCode ?? 502 },
      );
    }
    console.error("[send-gift] unexpected error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
