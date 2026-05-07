// POST /api/auth/logout
//
// Clears the mujo_session cookie + 302-redirects to /. Accepts POST only to
// prevent CSRF via a stray <img src="/api/auth/logout"> on a malicious site.

import type { NextRequest } from 'next/server';
import { clearSession } from 'lib/session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  await clearSession();
  const url = new URL(req.url);
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? url.origin
  ).replace(/\/$/, '');
  return Response.redirect(`${siteUrl}/`, 303);
}
