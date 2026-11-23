// Stripe webhook receiver.
// - Verifies signature with STRIPE_WEBHOOK_SECRET
// - Idempotency via webhook_events table (stripe_event_id unique)
// - Dispatches to per-event handlers in lib/webhook-handlers/
//
// Stripe retries on non-2xx for up to ~3 days. We always return 2xx UNLESS
// signature verification fails (400) or a handler throws (500 — Stripe will
// retry). The idempotency row is rolled back on handler error so the retry
// re-runs the handler. An attempt that is killed before it can roll back leaves
// an unfinished row; a later retry takes that over (see STALE_CLAIM_SECONDS).

import { and, eq, isNull, sql } from 'drizzle-orm';
import type { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { db, webhookEvents } from 'db';
import { stripe } from 'lib/stripe';
import { handleChargeFailed } from 'lib/webhook-handlers/charge-failed';
import { handleChargeRefunded } from 'lib/webhook-handlers/charge-refunded';
import { handleCheckoutCompleted } from 'lib/webhook-handlers/checkout-completed';
import { handleCheckoutExpired } from 'lib/webhook-handlers/checkout-expired';
import { handleInvoicePaid } from 'lib/webhook-handlers/invoice-paid';
import { handlePaymentIntentSucceeded } from 'lib/webhook-handlers/payment-intent-succeeded';
import { handleSubscriptionCreated } from 'lib/webhook-handlers/subscription-created';
import { handleSubscriptionUpdated } from 'lib/webhook-handlers/subscription-updated';

export const dynamic = 'force-dynamic';

// A handler makes up to a dozen Stripe and Shopify calls in a row. Give it a
// fixed, generous limit so it is not cut off part-way, and so we know for sure
// how long an attempt can possibly still be running (see STALE_CLAIM_SECONDS).
export const maxDuration = 60;

// An unfinished event older than this was certainly killed (it is twice the
// longest an attempt can run), so a retry may safely take it over.
const STALE_CLAIM_SECONDS = 120;

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

  // Mode guard: a live-keyed server must only act on live events, and a
  // test/sandbox-keyed server only on test events. Stripe's signature check
  // already segregates by mode, but this is explicit defense-in-depth so a
  // sandbox event can never create a real Shopify order (and vice versa).
  // Acknowledge with 200 so Stripe doesn't retry a deliberately-ignored event.
  const serverIsLive = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ?? false;
  if (event.livemode !== serverIsLive) {
    console.warn('[webhook] mode mismatch, ignoring event', {
      id: event.id,
      type: event.type,
      eventLivemode: event.livemode,
      serverIsLive,
    });
    return new Response('mode mismatch, ignored', { status: 200 });
  }

  // Idempotency check
  const inserted = await db
    .insert(webhookEvents)
    .values({ stripeEventId: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });

  if (inserted.length === 0) {
    // We have seen this event before. That only means it is DONE if the earlier
    // attempt finished (processed_at set). An attempt that was killed part-way
    // (timeout, crash, redeploy) never reaches the catch block below, so its row
    // stays behind unfinished. Until 2026-11-23 such a row made every retry
    // answer "already processed": the customer was charged and no order was
    // ever made.
    const [seen] = await db
      .select({ processedAt: webhookEvents.processedAt })
      .from(webhookEvents)
      .where(eq(webhookEvents.stripeEventId, event.id))
      .limit(1);

    if (seen?.processedAt) {
      console.log('[webhook] duplicate event, skipping', { id: event.id, type: event.type });
      return new Response('already processed', { status: 200 });
    }

    // Unfinished. Take it over only if the earlier attempt is certainly dead
    // (older than STALE_CLAIM); otherwise it may still be running, so ask Stripe
    // to come back later rather than run the same event twice at once. The
    // UPDATE is the lock: of two retries arriving together, only one gets a row.
    const reclaimed = await db
      .update(webhookEvents)
      .set({ receivedAt: sql`now()` })
      .where(
        and(
          eq(webhookEvents.stripeEventId, event.id),
          isNull(webhookEvents.processedAt),
          sql`${webhookEvents.receivedAt} < now() - make_interval(secs => ${STALE_CLAIM_SECONDS})`,
        ),
      )
      .returning({ id: webhookEvents.id });

    if (reclaimed.length === 0) {
      console.warn('[webhook] event still in progress (or just failed), asking Stripe to retry', {
        id: event.id,
        type: event.type,
      });
      return new Response('event in progress, retry later', { status: 409 });
    }
    console.warn('[webhook] re-running an event whose earlier attempt never finished', {
      id: event.id,
      type: event.type,
    });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event);
        break;
      case 'checkout.session.expired':
        await handleCheckoutExpired(event);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event);
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
