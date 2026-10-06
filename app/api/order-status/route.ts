// Returns the Shopify order number for a completed checkout, once the webhook
// has mirrored it. Polled by /checkout/success — the customer lands there a few
// seconds before the Shopify order exists.
//
// The lookup keys are the Stripe Checkout Session id and (for subscriptions)
// the invoice id: long random strings the customer already holds in their own
// confirmation URL. The response carries the order number and nothing else.

import { desc, eq, or } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import { db, orderMirror } from 'db';

export const dynamic = 'force-dynamic';

const ID = /^[A-Za-z0-9_]{10,255}$/;

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('session_id') ?? '';
  const invoiceId = req.nextUrl.searchParams.get('invoice_id') ?? '';

  if (!sessionId.startsWith('cs_') || !ID.test(sessionId)) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }
  if (invoiceId && (!invoiceId.startsWith('in_') || !ID.test(invoiceId))) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const match = invoiceId
    ? or(
        eq(orderMirror.stripeCheckoutSessionId, sessionId),
        eq(orderMirror.stripeInvoiceId, invoiceId),
      )
    : eq(orderMirror.stripeCheckoutSessionId, sessionId);

  const row = (
    await db
      .select({ name: orderMirror.shopifyOrderName })
      .from(orderMirror)
      .where(match)
      .orderBy(desc(orderMirror.createdAt))
      .limit(1)
  )[0];

  return Response.json(
    { orderName: row?.name ?? null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
