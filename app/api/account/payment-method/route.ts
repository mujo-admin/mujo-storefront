// Two-verb route for payment method updates:
//
//   POST   → mint a SetupIntent client_secret. Frontend mounts <Elements />
//            and calls confirmSetup() with the secret. Returns 401 if the
//            customer doesn't yet have a Stripe Customer (lazy-create
//            happens at first checkout).
//   PATCH  → after a confirmed SetupIntent, the frontend posts the new
//            paymentMethodId here to (a) set it as default on the Stripe
//            Customer + (b) propagate to all active subscriptions so the
//            next renewal charges the new card.

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { customers, db, subscriptions } from "db";
import { stripe } from "lib/stripe";
import { getSession, refreshSession } from "lib/session";

export const dynamic = "force-dynamic";

const ACTIVE_SUB_STATUSES = ["active", "trialing", "past_due", "paused"];

const patchSchema = z.object({
  paymentMethodId: z.string().startsWith("pm_"),
});

// --- POST: mint SetupIntent -------------------------------------------------

export async function POST(_req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const customerRow = (
    await db
      .select()
      .from(customers)
      .where(eq(customers.id, session.customerId))
      .limit(1)
  )[0];

  if (!customerRow?.stripeCustomerId) {
    return Response.json(
      {
        error: "no_stripe_customer",
        message:
          "You haven't completed a checkout yet, so there's no payment account to update.",
      },
      { status: 400 },
    );
  }

  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: customerRow.stripeCustomerId,
      payment_method_types: ["card"],
      usage: "off_session",
    });
    if (!setupIntent.client_secret) {
      console.error("[payment-method/POST] no client_secret on SetupIntent", {
        id: setupIntent.id,
      });
      return Response.json(
        { error: "stripe_no_client_secret" },
        { status: 502 },
      );
    }
    return Response.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      console.error("[payment-method/POST] Stripe error", {
        code: err.code,
        message: err.message,
      });
      return Response.json(
        { error: err.code ?? "stripe_error", message: err.message },
        { status: err.statusCode ?? 502 },
      );
    }
    console.error("[payment-method/POST] unexpected error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}

// --- PATCH: promote PM to default + propagate to subscriptions --------------

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  let parsed: z.infer<typeof patchSchema>;
  try {
    parsed = patchSchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      {
        error: "invalid_body",
        details: err instanceof z.ZodError ? err.issues : String(err),
      },
      { status: 400 },
    );
  }

  const customerRow = (
    await db
      .select()
      .from(customers)
      .where(eq(customers.id, session.customerId))
      .limit(1)
  )[0];

  if (!customerRow?.stripeCustomerId) {
    return Response.json(
      { error: "no_stripe_customer" },
      { status: 400 },
    );
  }

  // Defense in depth: confirm the PM is owned by this Stripe Customer before
  // touching it. SetupIntent creation already requires the customer ID, but
  // we re-verify in case of a tampered request.
  let pm: Stripe.PaymentMethod;
  try {
    pm = await stripe.paymentMethods.retrieve(parsed.paymentMethodId);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      console.error("[payment-method/PATCH] Stripe retrieve error", {
        code: err.code,
        message: err.message,
      });
      return Response.json(
        { error: err.code ?? "stripe_error", message: err.message },
        { status: err.statusCode ?? 502 },
      );
    }
    return Response.json({ error: "internal_error" }, { status: 500 });
  }

  const pmCustomer =
    typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
  if (pmCustomer !== customerRow.stripeCustomerId) {
    console.error("[payment-method/PATCH] PM not owned by customer", {
      pmId: parsed.paymentMethodId,
      pmCustomer,
      expected: customerRow.stripeCustomerId,
    });
    return Response.json(
      { error: "ownership_mismatch" },
      { status: 403 },
    );
  }

  try {
    // 1. Set as default on the Customer's invoice settings.
    await stripe.customers.update(customerRow.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: parsed.paymentMethodId,
      },
    });

    // 2. Propagate to all active subscriptions for this customer so the next
    //    renewal charges the new card. Iterate by DB rows we mirror; Stripe
    //    is the source of truth either way.
    const subs = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, session.customerId));

    const activeSubs = subs.filter((s) =>
      ACTIVE_SUB_STATUSES.includes(s.status),
    );

    await Promise.all(
      activeSubs.map((s) =>
        stripe.subscriptions
          .update(s.stripeSubscriptionId, {
            default_payment_method: parsed.paymentMethodId,
          })
          .catch((err) => {
            console.error("[payment-method/PATCH] sub update failed", {
              subId: s.stripeSubscriptionId,
              err: err instanceof Error ? err.message : String(err),
            });
          }),
      ),
    );

    await refreshSession();
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      console.error("[payment-method/PATCH] Stripe error", {
        code: err.code,
        message: err.message,
      });
      return Response.json(
        { error: err.code ?? "stripe_error", message: err.message },
        { status: err.statusCode ?? 502 },
      );
    }
    console.error("[payment-method/PATCH] unexpected error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
