// POST /api/billing-portal/request
//
// Body: { email: string }
// Behavior:
//  - Rate-limit by email (max 3/hour) — returns 429 if exceeded
//  - Find customer in app DB
//  - If found: generate magic-link JWT, send email via Resend
//  - If NOT found: still return 200 (anti-enumeration) — don't leak whether
//    an email is in our system. No email sent.
//
// Returns 200 with a generic confirmation message in all valid-input cases.

import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { customers, db } from 'db';
import { checkRateLimit, generateToken } from 'lib/magic-link';
import { resend, RESEND_FROM } from 'lib/resend';
import { MagicLinkEmail } from 'emails/magic-link';

export const dynamic = 'force-dynamic';

const requestSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    const body = await req.json();
    parsed = requestSchema.parse(body);
  } catch (err) {
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

  const customer = (
    await db.select().from(customers).where(eq(customers.email, email)).limit(1)
  )[0];

  // Anti-enumeration: always return 200, even if no customer exists.
  const genericResponse = Response.json({
    message: 'If that email is on file, you will receive a link shortly.',
  });

  if (!customer || !customer.stripeCustomerId) {
    console.log('[billing-portal/request] no customer for email (silent ack)', { email });
    return genericResponse;
  }

  try {
    const token = await generateToken(
      { email, stripeCustomerId: customer.stripeCustomerId },
      ip ?? undefined,
    );
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mujoworld.com';
    const href = `${siteUrl.replace(/\/$/, '')}/api/billing-portal/redeem?token=${encodeURIComponent(token)}`;

    const result = await resend.emails.send({
      from: RESEND_FROM,
      to: email,
      subject: 'Manage your Mujo subscription',
      react: MagicLinkEmail({ href, email }),
    });

    if (result.error) {
      console.error('[billing-portal/request] resend send error', result.error);
      // Still return 200 — user shouldn't see a downstream provider failure.
    } else {
      console.log('[billing-portal/request] sent', { email, id: result.data?.id });
    }
  } catch (err) {
    console.error('[billing-portal/request] unexpected error', err);
    // Still return 200 — anti-enumeration over fail-loud.
  }

  return genericResponse;
}
