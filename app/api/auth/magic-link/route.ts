// POST /api/auth/magic-link
//
// Body: { email: string }
// Behavior:
//  - Rate-limit per email (3/hour)
//  - Anti-enumeration: always return 200 in valid-input cases
//  - Lookup customer:
//    1. customers row by email → if found, send link
//    2. If not found, search Shopify Admin by email — if found there,
//       lazy-create customers row with shopifyCustomerId set + send link
//    3. If neither, log silently and return 200 anyway
//  - Token audience: 'session' (7-day TTL, signed with MUJO_SESSION_SECRET)
//
// On click: customer lands on /api/auth/redeem which sets the session cookie
// and 302-redirects to /account.

import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { customers, db } from 'db';
import { checkRateLimit, generateToken } from 'lib/magic-link';
import { resend, RESEND_FROM, uniqueSubject } from 'lib/resend';
import { findCustomerByEmail } from 'lib/shopify-admin';
import { LoginLinkEmail } from 'emails/login-link';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    const body = await req.json();
    parsed = requestSchema.parse(body);
  } catch {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const { email } = parsed;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const allowed = await checkRateLimit(email);
  if (!allowed) {
    return Response.json(
      { error: 'rate_limited', message: 'Too many requests. Try again in an hour.' },
      { status: 429 },
    );
  }

  // Anti-enumeration: always 200, even if no account exists.
  const genericResponse = Response.json({
    message: 'If that email is on file, you will receive a login link shortly.',
  });

  // Path 1: customer exists in app DB.
  let row = (
    await db.select().from(customers).where(eq(customers.email, email)).limit(1)
  )[0];

  // Path 2: lazy-create from Shopify Admin if not in app DB.
  if (!row) {
    try {
      const shopifyCustomer = await findCustomerByEmail(email);
      if (shopifyCustomer) {
        const inserted = await db
          .insert(customers)
          .values({
            email,
            shopifyCustomerId: shopifyCustomer.id,
          })
          .returning();
        row = inserted[0];
        console.log('[auth/magic-link] lazy-created from Shopify', {
          email,
          shopifyCustomerId: shopifyCustomer.id,
        });
      }
    } catch (err) {
      console.error('[auth/magic-link] Shopify lookup failed', err);
      // Don't surface to caller — keep anti-enumeration intact.
    }
  }

  // Path 3: nothing found anywhere — log + return generic 200.
  if (!row) {
    console.log('[auth/magic-link] no customer (silent ack)', { email });
    return genericResponse;
  }

  try {
    const token = await generateToken(
      'session',
      {
        email,
        customerId: row.id,
        stripeCustomerId: row.stripeCustomerId ?? null,
      },
      { ipAddress: ip ?? undefined, rateLimitEmail: email },
    );
    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mujoworld.com'
    ).replace(/\/$/, '');
    const href = `${siteUrl}/api/auth/redeem?token=${encodeURIComponent(token)}`;

    const result = await resend.emails.send({
      from: RESEND_FROM,
      to: email,
      subject: uniqueSubject('Your Mujo login link'),
      react: LoginLinkEmail({ href, email }),
    });

    if (result.error) {
      console.error('[auth/magic-link] resend send error', result.error);
    } else {
      console.log('[auth/magic-link] sent', {
        email,
        id: result.data?.id,
      });
    }
  } catch (err) {
    console.error('[auth/magic-link] unexpected error', err);
  }

  return genericResponse;
}
