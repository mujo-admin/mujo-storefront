// Stripe webhook receiver.
// - Verifies signature with STRIPE_WEBHOOK_SECRET
// - Idempotency via webhook_events table (stripe_event_id unique)
// - Dispatches to per-event handlers in lib/webhook-handlers/
//
// Stripe retries on non-2xx for up to ~3 days. We always return 2xx UNLESS
// signature verification fails (400) or a handler throws (500 — Stripe will
// retry). The idempotency row is rolled back on handler error so the retry
// re-runs the handler.

import { eq } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { db, webhookEvents } from 'db';
import { stripe } from 'lib/stripe';
import { handleChargeFailed } from 'lib/webhook-handlers/charge-failed';
import { handleChargeRefunded } from 'lib/webhook-handlers/charge-refunded';
import { handleCheckoutCompleted } from 'lib/webhook-handlers/checkout-completed';
import { handleInvoicePaid } from 'lib/webhook-handlers/invoice-paid';
import { handlePaymentIntentSucceeded } from 'lib/webhook-handlers/payment-intent-succeeded';
import { handleSubscriptionUpdated } from 'lib/webhook-handlers/subscription-updated';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig) return new Response('missing stripe-signature', { status: 400 });
  if (!secret) return new Response('STRIPE_WEBHOOK_SECRET not configured', { status: 500 });

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid signature';
    console.error('[webhook] signature verification failed', msg);
    return new Response(`webhook signature verification failed: ${msg}`, { status: 400 });
  }

  // Idempotency check
  const inserted = await db
    .insert(webhookEvents)
    .values({ stripeEventId: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0) {
    console.log('[webhook] duplicate event, skipping', { id: event.id, type: event.type });
    return new Response('already processed', { status: 200 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event);
        break;
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await handleSubscriptionUpdated(event);
        break;
      case 'charge.failed':
        await handleChargeFailed(event);
        break;
      case 'charge.refunded':
        await handleChargeRefunded(event);
        break;
      default:
        console.log('[webhook] unhandled event type', { type: event.type });
    }

    await db
      .update(webhookEvents)
      .set({ processedAt: new Date() })
      .where(eq(webhookEvents.stripeEventId, event.id));

    return new Response('ok', { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[webhook] handler error', { type: event.type, id: event.id, error: msg });

    // Roll back the idempotency row so Stripe's retry re-processes
    await db
      .delete(webhookEvents)
      .where(eq(webhookEvents.stripeEventId, event.id));

    // Optional: persist the error on the row before deleting? No — we want a
    // clean retry. The Stripe dashboard's "Failed events" view records this.

    return new Response(`handler error: ${msg}`, { status: 500 });
  }
}
