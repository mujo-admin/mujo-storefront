// Handler: checkout.session.completed
//
// Fires on every successful Stripe Checkout (one-time + subscription initial).
// One-time path: creates the Shopify order with charge ID + records in order_mirror.
// Subscription path: creates/links the customer; the actual order creates when
// invoice.paid fires (with billing_reason=subscription_create) — that path is
// in invoice-paid.ts so order-creation logic stays in one place.

import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, orderMirror } from 'db';
import { stripe } from 'lib/stripe';
import { trackOrderPlaced } from 'lib/klaviyo';
import { sendCapiEvent } from 'lib/meta-capi';
import { createMirroredOrder, upsertCustomerForStripe } from './_helpers';
import { factsFromCheckoutSession } from './_order-facts';

export async function handleCheckoutCompleted(event: Stripe.Event) {
  if (event.type !== 'checkout.session.completed') return;
  const session = event.data.object;

  const stripeCustomerId =
    typeof session.customer === 'string' ? session.customer : session.customer?.id;
  // Customer email: prefer customer_details (collected in-session), fall back to
  // top-level customer_email, else inspect the (possibly expanded) customer.
  let email = session.customer_details?.email ?? session.customer_email ?? null;
  if (!email && typeof session.customer === 'object' && session.customer) {
    if (!('deleted' in session.customer) || session.customer.deleted !== true) {
      email = session.customer.email ?? null;
    }
  }

  if (!stripeCustomerId || !email) {
    console.error('[checkout.completed] missing customer linkage', {
      sessionId: session.id,
      stripeCustomerId,
      email,
    });
    return;
  }

  const customerName = session.customer_details?.name?.split(' ') ?? [];
  const { customerId, shopifyCustomerGid } = await upsertCustomerForStripe({
    email,
    stripeCustomerId,
    firstName: customerName[0],
    lastName: customerName.slice(1).join(' ') || undefined,
  });

  // Subscription: defer order creation to invoice.paid handler
  if (session.mode === 'subscription') {
    console.log('[checkout.completed] subscription created, deferring order to invoice.paid', {
      sessionId: session.id,
      customerId,
    });
    return;
  }

  if (session.mode !== 'payment') {
    console.log('[checkout.completed] unhandled mode', { mode: session.mode });
    return;
  }

  // Idempotency: skip if we've already mirrored this checkout session
  const existing = await db
    .select({ id: orderMirror.id })
    .from(orderMirror)
    .where(eq(orderMirror.stripeCheckoutSessionId, session.id))
    .limit(1);
  if (existing.length > 0) {
    console.log('[checkout.completed] order already mirrored, skipping', {
      sessionId: session.id,
    });
    return;
  }

  // Resolve charge id via the payment intent
  let chargeId: string | undefined;
  if (typeof session.payment_intent === 'string') {
    const pi = await stripe.paymentIntents.retrieve(session.payment_intent, {
      expand: ['latest_charge'],
    });
    const latest = pi.latest_charge;
    chargeId = typeof latest === 'string' ? latest : latest?.id;
  } else if (session.payment_intent && typeof session.payment_intent === 'object') {
    const latest = session.payment_intent.latest_charge;
    chargeId = typeof latest === 'string' ? latest : latest?.id;
  }
  if (!chargeId) {
    console.error('[checkout.completed] no charge id resolvable', { sessionId: session.id });
    return;
  }

  // Everything Stripe charged — items, shipping, tax, discount — as facts the
  // shared builder turns into a complete Shopify order. Line items carry the
  // Shopify ProductVariant GID from Price metadata.shopify_variant_id (written
  // by the mirror script) so the order is linked for inventory + fulfilment.
  const { facts, lineItems } = await factsFromCheckoutSession(session, chargeId);

  // Dahlia: shipping_details moved to collected_information.shipping_details
  const shipping = session.collected_information?.shipping_details;
  const shippingAddr = shipping?.address;
  const shippingNameParts = shipping?.name?.split(' ') ?? [];

  const shopifyOrder = await createMirroredOrder({
    context: '[checkout.completed]',
    facts,
    base: {
      email,
      customerId: shopifyCustomerGid,
      currency: (session.currency ?? 'usd').toUpperCase(),
      tags: ['stripe-checkout', 'one-time'],
      note: `Stripe session: ${session.id} | charge: ${chargeId}`,
      shippingAddress: shippingAddr
        ? {
            firstName: shippingNameParts[0],
            lastName: shippingNameParts.slice(1).join(' ') || undefined,
            address1: shippingAddr.line1 ?? undefined,
            address2: shippingAddr.line2 ?? undefined,
            city: shippingAddr.city ?? undefined,
            province: shippingAddr.state ?? undefined,
            country: shippingAddr.country ?? undefined,
            zip: shippingAddr.postal_code ?? undefined,
          }
        : undefined,
      metafields: [
        {
          namespace: 'mujo_commerce',
          key: 'stripe_charge_id',
          type: 'single_line_text_field',
          value: chargeId,
        },
        {
          namespace: 'mujo_commerce',
          key: 'stripe_checkout_session_id',
          type: 'single_line_text_field',
          value: session.id,
        },
      ],
    },
  });

  await db.insert(orderMirror).values({
    stripeChargeId: chargeId,
    stripeCheckoutSessionId: session.id,
    shopifyOrderId: shopifyOrder.legacyResourceId,
    shopifyOrderName: shopifyOrder.name,
    customerId,
    type: 'one_time',
    amountCents: session.amount_total ?? 0,
    currency: (session.currency ?? 'usd').toLowerCase(),
  });

  console.log('[checkout.completed] one-time order mirrored', {
    sessionId: session.id,
    shopifyOrder: shopifyOrder.name,
  });

  // Server-fired analytics for the Embedded Checkout one-time path. Pixel
  // (client) fires the matching Purchase event with the same event_id from
  // session.metadata.mujo_event_id; Meta CAPI dedups on event_id.
  void trackOrderPlaced({
    email,
    orderId: shopifyOrder.name,
    value: (session.amount_total ?? 0) / 100,
    currency: (session.currency ?? 'usd').toUpperCase(),
    items: lineItems.map((li) => {
      const priceId =
        typeof li.price === 'object' && li.price ? li.price.id : '';
      return {
        name: li.description ?? priceId,
        quantity: li.quantity ?? 1,
        priceId,
      };
    }),
  }).catch((err) =>
    console.error('[checkout.completed] Klaviyo Order Placed failed', err),
  );

  const eventId = session.metadata?.mujo_event_id;
  if (eventId) {
    void sendCapiEvent({
      eventName: 'Purchase',
      eventId,
      userData: { email },
      customData: {
        currency: (session.currency ?? 'usd').toUpperCase(),
        value: (session.amount_total ?? 0) / 100,
        num_items: lineItems.length,
        content_ids: lineItems.map((li) =>
          typeof li.price === 'object' && li.price ? li.price.id : '',
        ),
      },
    }).catch((err) =>
      console.error('[checkout.completed] Meta CAPI Purchase failed', err),
    );
  }
}
