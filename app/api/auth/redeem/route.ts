// GET /api/auth/redeem?token=...
//
// Verifies the session magic-link, marks it consumed, sets the mujo_session
// cookie, 302-redirects to /account (or to the redirect= URL if same-origin).
// On invalid / expired / used: redirects to /account/login/error?reason=...

import type { NextRequest } from 'next/server';
import { verifyAndConsumeToken } from 'lib/magic-link';
import { setSession } from 'lib/session';

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

  await setSession({
    customerId: result.payload.customerId,
    email: result.payload.email,
    stripeCustomerId: result.payload.stripeCustomerId,
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
