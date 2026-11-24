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
import { sql } from "drizzle-orm";
import { z } from "zod";
import { customers, db } from "db";
import { checkRateLimit, generateToken } from "lib/magic-link";
import { resend, RESEND_FROM, uniqueSubject } from "lib/resend";
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

  // Rate-limit by current session email (the requesting customer). This runs
  // BEFORE the "is that address taken" check, so that check cannot be used to
  // test an unlimited number of addresses.
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

  // If the new address already belongs to another account, answer exactly as
  // on success and send nothing. A distinct "not available" reply told any
  // logged-in customer which addresses are Mujo customers.
  const conflict = (
    await db
      .select({ id: customers.id })
      .from(customers)
      .where(sql`lower(${customers.email}) = ${parsed.newEmail}`)
      .limit(1)
  )[0];
  if (conflict && conflict.id !== session.customerId) {
    console.log("[profile/email] address already in use by another account", {
      customerId: session.customerId,
    });
    return Response.json({ ok: true });
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
      subject: uniqueSubject("Confirm your new Mujo email"),
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

  // Tell the CURRENT address too. If someone else got into the account and
  // is moving it to their own email, this is how the real owner finds out.
  try {
    const [local = "", domain = ""] = parsed.newEmail.split("@");
    const masked = `${local.slice(0, 2)}***@${domain}`;
    await resend.emails.send({
      from: RESEND_FROM,
      to: session.email,
      subject: uniqueSubject("Your Mujo email address is being changed"),
      text: [
        `Someone asked to change the email on your Mujo account to ${masked}.`,
        "",
        "If that was you, there is nothing to do here: confirm the change from your new inbox.",
        "",
        "If it was not you, reply to this email straight away and we will secure your account. Nothing changes unless the link sent to the new address is opened.",
        "",
        "Mujo",
      ].join("\n"),
    });
  } catch (err) {
    console.error("[profile/email] notice to current address failed", err);
  }

  return Response.json({ ok: true });
}
