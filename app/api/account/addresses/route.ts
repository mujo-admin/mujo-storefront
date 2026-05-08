// PATCH /api/account/addresses
//
// Body: { name, line1, line2, city, state, postalCode, phone }
//
// Writes Stripe Customer.shipping. Active subscriptions inherit shipping
// from the customer record, so the next invoice for any active sub picks
// up the new address automatically.
//
// Mujo is US-only — country is always "US" per project_us_only_shipping
// memory. We don't accept a country field in the body.

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { customers, db } from "db";
import { stripe } from "lib/stripe";
import { getSession, refreshSession } from "lib/session";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).max(120),
  line1: z.string().min(1).max(200),
  line2: z.string().max(200).optional().default(""),
  city: z.string().min(1).max(120),
  state: z.string().length(2),
  postalCode: z
    .string()
    .regex(/^\d{5}(-\d{4})?$/, "ZIP must be 5 digits, optionally ZIP+4."),
  phone: z.string().max(30).optional().default(""),
});

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
      {
        error: "no_stripe_customer",
        message:
          "You haven't completed a checkout yet, so there's no shipping address on file.",
      },
      { status: 400 },
    );
  }

  try {
    await stripe.customers.update(customerRow.stripeCustomerId, {
      shipping: {
        name: parsed.name.trim(),
        phone: parsed.phone.trim() || undefined,
        address: {
          line1: parsed.line1.trim(),
          line2: parsed.line2.trim() || undefined,
          city: parsed.city.trim(),
          state: parsed.state.toUpperCase(),
          postal_code: parsed.postalCode.trim(),
          country: "US",
        },
      },
      // Also write the address to the customer's billing address for tax
      // calculation. Stripe Tax keys off the customer's address (not just the
      // shipping address) for the location-of-supply rule.
      address: {
        line1: parsed.line1.trim(),
        line2: parsed.line2.trim() || undefined,
        city: parsed.city.trim(),
        state: parsed.state.toUpperCase(),
        postal_code: parsed.postalCode.trim(),
        country: "US",
      },
    });

    await refreshSession();
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      console.error("[addresses/PATCH] Stripe error", {
        code: err.code,
        message: err.message,
      });
      return Response.json(
        { error: err.code ?? "stripe_error", message: err.message },
        { status: err.statusCode ?? 502 },
      );
    }
    console.error("[addresses/PATCH] unexpected error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
