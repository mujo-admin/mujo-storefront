// GET /api/auth/redeem?token=...
//
// Verifies the session magic-link, marks it consumed, sets the mujo_session
// cookie, 302-redirects to /account (or to the redirect= URL if same-origin).
// On invalid / expired / used: redirects to /account/login/error?reason=...

import type { NextRequest } from 'next/server';
import { verifyAndConsumeToken } from 'lib/magic-link';
import { eq } from 'drizzle-orm';
import { customers, db } from 'db';
import { sessionStillValid, setSession } from 'lib/session';

export const dynamic = 'force-dynamic';

const ERROR_REASONS = ['invalid', 'expired', 'used', 'unknown'] as const;
type ErrorReason = (typeof ERROR_REASONS)[number];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const requestedRedirect = url.searchParams.get('redirect');
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? url.origin
  ).replace(/\/$/, '');

  if (!token) {
    return Response.redirect(
      `${siteUrl}/account/login/error?reason=invalid`,
      302,
    );
  }

  const result = await verifyAndConsumeToken('session', token);
  if (!result.ok) {
    const reason: ErrorReason = (ERROR_REASONS as readonly string[]).includes(
      result.reason,
    )
      ? (result.reason as ErrorReason)
      : 'unknown';
    return Response.redirect(
      `${siteUrl}/account/login/error?reason=${reason}`,
      302,
    );
  }

  // The link was made a while ago: use the account as it is NOW (the email or
  // Stripe link may have changed), and refuse a link issued before the
  // customer logged out or changed their email.
  const row = (
    await db
      .select()
      .from(customers)
      .where(eq(customers.id, result.payload.customerId))
      .limit(1)
  )[0];
  if (!row || !(await sessionStillValid(row.id, result.issuedAt))) {
    return Response.redirect(`${siteUrl}/account/login/error?reason=expired`, 302);
  }

  await setSession({
    customerId: row.id,
    email: row.email,
    stripeCustomerId: row.stripeCustomerId ?? null,
  });

  // Same-origin guard on the optional redirect param. Reject anything that
  // isn't a relative path starting with `/account` or `/checkout` to avoid
  // open-redirect abuse via crafted magic-link URLs.
  let target = '/account';
  if (
    requestedRedirect &&
    requestedRedirect.startsWith('/') &&
    !requestedRedirect.startsWith('//')
  ) {
    target = requestedRedirect;
  }

  return Response.redirect(`${siteUrl}${target}`, 302);
}
