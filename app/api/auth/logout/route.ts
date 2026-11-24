// POST /api/auth/logout
//
// Ends the customer's sessions on every device, clears the mujo_session
// cookie + redirects to /. Accepts POST only to
// prevent CSRF via a stray <img src="/api/auth/logout"> on a malicious site.

import type { NextRequest } from 'next/server';
import { clearSession, getSession, revokeSessions } from 'lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // Clearing the cookie only logs out THIS browser; a copied cookie would keep
  // working. Ending the sessions server-side is what makes logout real.
  const session = await getSession();
  if (session) await revokeSessions(session.customerId);
  await clearSession();
  const url = new URL(req.url);
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? url.origin
  ).replace(/\/$/, '');
  return Response.redirect(`${siteUrl}/`, 303);
}
