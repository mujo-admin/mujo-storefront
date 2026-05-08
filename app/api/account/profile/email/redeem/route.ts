// GET /api/account/profile/email/redeem?token=...
//
// Verifies the email-change magic-link, commits the new email across:
//   1. customers.email (Postgres)
//   2. Stripe Customer.email
//   3. Klaviyo profile email (via merge_profiles to avoid duplicates)
// Then clears the current session (forces re-login under the new email).
//
// On error: redirects to /account/login/error?reason=<...>.
// On success: redirects to /account/login?reason=email-changed (login page
// shows a banner confirming the change).

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import Stripe from "stripe";
import { customers, db } from "db";
import { stripe } from "lib/stripe";
import { verifyAndConsumeToken } from "lib/magic-link";
import { clearSession } from "lib/session";
import { changeProfileEmail } from "lib/klaviyo";

export const dynamic = "force-dynamic";

const ERROR_REASONS = ["invalid", "expired", "used", "unknown"] as const;
type ErrorReason = (typeof ERROR_REASONS)[number];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? url.origin).replace(
    /\/$/,
    "",
  );

  if (!token) {
    return Response.redirect(
      `${siteUrl}/account/login/error?reason=invalid`,
      302,
    );
  }

  const result = await verifyAndConsumeToken("email-change", token);
  if (!result.ok) {
    const reason: ErrorReason = (ERROR_REASONS as readonly string[]).includes(
      result.reason,
    )
      ? (result.reason as ErrorReason)
      : "unknown";
    return Response.redirect(
      `${siteUrl}/account/login/error?reason=${reason}`,
      302,
    );
  }

  const { customerId, oldEmail, newEmail } = result.payload;

  // Double-check that customer record still exists + still has the oldEmail.
  // Prevents replays where token is valid but customer-side state has moved.
  const customerRow = (
    await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1)
  )[0];

  if (!customerRow || customerRow.email.toLowerCase() !== oldEmail.toLowerCase()) {
    return Response.redirect(
      `${siteUrl}/account/login/error?reason=invalid`,
      302,
    );
  }

  // Re-check newEmail isn't taken between request + redeem.
  const conflict = (
    await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.email, newEmail))
      .limit(1)
  )[0];
  if (conflict && conflict.id !== customerId) {
    console.error("[profile/email/redeem] newEmail taken by another customer", {
      customerId,
      newEmail,
    });
    return Response.redirect(
      `${siteUrl}/account/login/error?reason=invalid`,
      302,
    );
  }

  // 1. Postgres
  await db
    .update(customers)
    .set({ email: newEmail, updatedAt: new Date() })
    .where(eq(customers.id, customerId));

  // 2. Stripe Customer
  if (customerRow.stripeCustomerId) {
    try {
      await stripe.customers.update(customerRow.stripeCustomerId, {
        email: newEmail,
      });
    } catch (err) {
      // Log but don't fail the flow — Postgres is the source of truth for
      // the auth side; Stripe.email is downstream and recoverable manually.
      if (err instanceof Stripe.errors.StripeError) {
        console.error("[profile/email/redeem] stripe update failed", {
          code: err.code,
          message: err.message,
        });
      } else {
        console.error("[profile/email/redeem] stripe error", err);
      }
    }
  }

  // 3. Klaviyo (uses merge_profiles to avoid dupes per plan §risks).
  try {
    await changeProfileEmail({ oldEmail, newEmail });
  } catch (err) {
    console.error("[profile/email/redeem] klaviyo update failed", err);
  }

  // 4. Invalidate current session — forces re-login under the new email.
  // This is intentional: the session token still carries the old email in
  // its payload, and rotating credentials on email change is a standard
  // account-security pattern.
  await clearSession();

  return Response.redirect(
    `${siteUrl}/account/login?reason=email-changed&email=${encodeURIComponent(newEmail)}`,
    302,
  );
}
