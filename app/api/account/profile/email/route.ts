// POST /api/account/profile/email
//
// Body: { newEmail: string }
//
// Initiates an email change. Sends a verification link to the NEW email
// address. The link carries an audience='email-change' token (24-hour TTL)
// with payload { customerId, oldEmail, newEmail }. Customer must click
// from the new inbox before the change commits — standard account-takeover
// prevention pattern.
//
// Rate-limited per requesting customer email (3/hour, shared limiter with
// session magic-link).

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { customers, db } from "db";
import { checkRateLimit, generateToken } from "lib/magic-link";
import { resend, RESEND_FROM } from "lib/resend";
import { getSession } from "lib/session";
import { EmailChangeVerificationEmail } from "emails/email-change-verification";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  newEmail: z.string().email().toLowerCase(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  let parsed: { newEmail: string };
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

  if (parsed.newEmail === session.email.toLowerCase()) {
    return Response.json(
      {
        error: "same_email",
        message: "New email is the same as your current address.",
      },
      { status: 400 },
    );
  }

  // Reject if newEmail already belongs to another account in our DB.
  const conflict = (
    await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.email, parsed.newEmail))
      .limit(1)
  )[0];
  if (conflict && conflict.id !== session.customerId) {
    // Use generic message — we don't want to leak account-existence at the
    // new address. Customer can still get a "Something went wrong" experience.
    console.log("[profile/email] address already in use by another account", {
      customerId: session.customerId,
      newEmail: parsed.newEmail,
    });
    return Response.json(
      {
        error: "email_in_use",
        message: "This email is not available. Try a different address.",
      },
      { status: 409 },
    );
  }

  // Rate-limit by current session email (the requesting customer).
  const allowed = await checkRateLimit(session.email);
  if (!allowed) {
    return Response.json(
      {
        error: "rate_limited",
        message: "Too many requests. Try again in an hour.",
      },
      { status: 429 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  try {
    const token = await generateToken(
      "email-change",
      {
        customerId: session.customerId,
        oldEmail: session.email,
        newEmail: parsed.newEmail,
      },
      { ipAddress: ip ?? undefined, rateLimitEmail: session.email },
    );
    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://mujoworld.com"
    ).replace(/\/$/, "");
    const href = `${siteUrl}/api/account/profile/email/redeem?token=${encodeURIComponent(token)}`;

    const result = await resend.emails.send({
      from: RESEND_FROM,
      to: parsed.newEmail,
      subject: "Confirm your new Mujo email",
      react: EmailChangeVerificationEmail({
        href,
        oldEmail: session.email,
        newEmail: parsed.newEmail,
      }),
    });

    if (result.error) {
      console.error("[profile/email] resend send error", result.error);
      return Response.json(
        { error: "send_failed", message: "Could not send confirmation email." },
        { status: 502 },
      );
    }
  } catch (err) {
    console.error("[profile/email] unexpected error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
