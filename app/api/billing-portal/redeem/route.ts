// GET /api/billing-portal/redeem?token=...
//
// Verifies the magic-link JWT, marks it consumed, creates a Stripe Billing
// Portal Session for the linked customer, and 302-redirects to the portal URL.
//
// On invalid / expired / used / unknown token: redirects to /account/expired
// (a thin error page that prompts the user to request a new link).

import type { NextRequest } from 'next/server';
import { stripe } from 'lib/stripe';
import { verifyAndConsumeToken } from 'lib/magic-link';

export const dynamic = 'force-dynamic';

const ERROR_PATHS: Record<string, string> = {
  invalid: '/account/expired?reason=invalid',
  expired: '/account/expired?reason=expired',
  used: '/account/expired?reason=used',
  unknown: '/account/expired?reason=unknown',
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? url.origin).replace(/\/$/, '');

  if (!token) {
    return Response.redirect(`${siteUrl}/account/expired?reason=missing`, 302);
  }

  const result = await verifyAndConsumeToken(token);
  if (!result.ok) {
    return Response.redirect(`${siteUrl}${ERROR_PATHS[result.reason]}`, 302);
  }

  const { stripeCustomerId } = result.payload;

  try {
    const portal = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${siteUrl}/account/returned`,
    });
    return Response.redirect(portal.url, 302);
  } catch (err) {
    console.error('[billing-portal/redeem] stripe portal create failed', err);
    return Response.redirect(`${siteUrl}/account/expired?reason=stripe_error`, 302);
  }
}
