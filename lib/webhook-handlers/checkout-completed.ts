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
import { createOrder } from 'lib/shopify-admin';
import { upsertCustomerForStripe } from './_helpers';

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

  // Pull line items (not always inflated on the session payload)
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    expand: ['data.price.product'],
  });

  const shopifyOrderLineItems = lineItems.data.map((li) => ({
    title: li.description ?? 'Item',
    quantity: li.quantity ?? 1,
    priceSet: {
      shopMoney: {
        amount: ((li.amount_subtotal ?? 0) / 100).toFixed(2),
        currencyCode: (li.currency ?? session.currency ?? 'usd').toUpperCase(),
      },
    },
  }));

  // Dahlia: shipping_details moved to collected_information.shipping_details
  const shipping = session.collected_information?.shipping_details;
  const shippingAddr = shipping?.address;
  const shippingNameParts = shipping?.name?.split(' ') ?? [];

  const shopifyOrder = await createOrder({
    email,
    customerId: shopifyCustomerGid,
    currency: (session.currency ?? 'usd').toUpperCase(),
    tags: ['stripe-checkout', 'one-time'],
    note: `Stripe session: ${session.id} | charge: ${chargeId}`,
    financialStatus: 'PAID',
    lineItems: shopifyOrderLineItems,
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
}
