// PATCH /api/account/profile
//
// Body: { firstName?: string; lastName?: string; marketingConsent?: 'subscribed' | 'unsubscribed' }
//
// Independently mutable fields:
//   - Name → written to Stripe Customer.name (single source of truth per
//     plan §5.4). Soft-fails if Stripe Customer ID missing (lazy-create
//     customer not yet linked to Stripe; happens at first checkout).
//   - Marketing consent → flipped via Klaviyo bulk subscribe / unsubscribe.
//
// Email changes go through the separate /email + /email/redeem flow because
// they require new-address verification.

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { customers, db } from "db";
import { stripe } from "lib/stripe";
import { setEmailMarketingConsent } from "lib/klaviyo";
import { getSession, refreshSession } from "lib/session";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    marketingConsent: z.enum(["subscribed", "unsubscribed"]).optional(),
  })
  .refine(
    (v) =>
      v.firstName !== undefined ||
      v.lastName !== undefined ||
      v.marketingConsent !== undefined,
    { message: "At least one field must be provided." },
  );

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

  // Name changes — write Stripe Customer.name as combined "first last".
  if (parsed.firstName !== undefined || parsed.lastName !== undefined) {
    const customerRow = (
      await db
        .select()
        .from(customers)
        .where(eq(customers.id, session.customerId))
        .limit(1)
    )[0];

    if (customerRow?.stripeCustomerId) {
      try {
        // Read the existing name first so partial updates merge cleanly.
        const existingCustomer = await stripe.customers.retrieve(
          customerRow.stripeCustomerId,
        );
        let existingFirst = "";
        let existingLast = "";
        if (
          existingCustomer &&
          !(existingCustomer as Stripe.DeletedCustomer).deleted
        ) {
          const existing = (existingCustomer as Stripe.Customer).name ?? "";
          if (existing) {
            const parts = existing.trim().split(/\s+/);
            existingFirst = parts[0] ?? "";
            existingLast = parts.slice(1).join(" ");
          }
        }
        const nextFirst =
          parsed.firstName !== undefined ? parsed.firstName.trim() : existingFirst;
        const nextLast =
          parsed.lastName !== undefined ? parsed.lastName.trim() : existingLast;
        const combined = [nextFirst, nextLast].filter(Boolean).join(" ");
        await stripe.customers.update(customerRow.stripeCustomerId, {
          name: combined.length > 0 ? combined : undefined,
        });
      } catch (err) {
        if (err instanceof Stripe.errors.StripeError) {
          console.error("[profile/PATCH] stripe customer update failed", {
            code: err.code,
            message: err.message,
          });
          return Response.json(
            { error: err.code ?? "stripe_error", message: err.message },
            { status: err.statusCode ?? 502 },
          );
        }
        console.error("[profile/PATCH] stripe error", err);
        return Response.json({ error: "stripe_error" }, { status: 502 });
      }
    } else {
      // No Stripe Customer yet — defer name capture until first checkout
      // (Stripe collects billing name automatically). Returning success here
      // matches the lazy-create flow for Shopify-only customers.
      console.log("[profile/PATCH] name change skipped (no stripe customer)", {
        customerId: session.customerId,
      });
    }
  }

  // Marketing consent — flip Klaviyo channel-level consent.
  if (parsed.marketingConsent !== undefined) {
    try {
      await setEmailMarketingConsent({
        email: session.email,
        consent: parsed.marketingConsent,
      });
    } catch (err) {
      console.error("[profile/PATCH] klaviyo consent failed", err);
      return Response.json(
        { error: "klaviyo_error", message: "Could not update preferences." },
        { status: 502 },
      );
    }
  }

  await refreshSession();
  return Response.json({ ok: true });
}
