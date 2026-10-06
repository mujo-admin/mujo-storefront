// Handler: payment_intent.succeeded
//
// Fires for one-time on-site Stripe Elements purchases (mode='payment').
// Subscription PaymentIntents fire too, but the order-creation path runs
// off invoice.paid (W2's existing handler) so this handler short-circuits
// for subscription PIs to avoid double-mirroring.

import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, orderMirror } from 'db';
import { stripe } from 'lib/stripe';
import { trackOrderPlaced } from 'lib/klaviyo';
import { sendCapiEvent } from 'lib/meta-capi';
import {
  attributionFromMetadata,
  capiUserData,
  itemsFromPriceIds,
  klaviyoAttributionProps,
  metaCustomData,
  SITE_ORIGIN,
} from 'lib/analytics-server';
import { createMirroredOrder, upsertCustomerForStripe } from './_helpers';
import { factsFromGiftPaymentIntent } from './_order-facts';

export async function handlePaymentIntentSucceeded(event: Stripe.Event) {
  if (event.type !== 'payment_intent.succeeded') return;
  const pi = event.data.object;

  // Subscription PIs flow through invoice.paid — skip here to avoid duplicate
  // orders. Detection: PIs created by /api/payment-intent in payment mode
  // carry our `mujo_event_id` + `line_items` metadata. Subscription invoice
  // PIs (created internally by Stripe when the subscription is created) do
  // not — those flow through invoice.paid → existing W2 handler.
  const lineItemsRaw = pi.metadata?.line_items;
  if (!lineItemsRaw) {
    console.log('[pi.succeeded] no line_items metadata — likely subscription invoice PI, deferring', {
      paymentIntentId: pi.id,
    });
    return;
  }

  const stripeCustomerId =
    typeof pi.customer === 'string' ? pi.customer : pi.customer?.id;
  const buyerEmail = pi.receipt_email ?? null;

  // Gift orders: buyer's customer record stays the owner of the order in
  // our DB + Shopify Admin, but the Shopify order's email field gets the
  // customer-chosen recipient email so shipping confirmation + tracking
  // emails route to the recipient (or back to the buyer if they chose
  // their own email).
  const isGiftOrder = pi.metadata?.gift_order === 'true';
  const giftRecipientEmail = pi.metadata?.gift_recipient_email ?? null;
  const orderEmail = isGiftOrder
    ? giftRecipientEmail ?? buyerEmail
    : buyerEmail;

  if (!stripeCustomerId || !buyerEmail || !orderEmail) {
    console.error('[pi.succeeded] missing customer linkage', {
      paymentIntentId: pi.id,
      stripeCustomerId,
      buyerEmail,
      orderEmail,
      isGiftOrder,
    });
    return;
  }

  // Idempotency — skip if we've already mirrored this PI.
  const chargeId =
    typeof pi.latest_charge === 'string'
      ? pi.latest_charge
      : pi.latest_charge?.id;
  if (!chargeId) {
    console.error('[pi.succeeded] no charge id resolvable', { paymentIntentId: pi.id });
    return;
  }
  const existing = await db
    .select({ id: orderMirror.id })
    .from(orderMirror)
    .where(eq(orderMirror.stripeChargeId, chargeId))
    .limit(1);
  if (existing.length > 0) {
    console.log('[pi.succeeded] order already mirrored, skipping', { chargeId });
    return;
  }

  // Resolve Shopify customer + write back stripe_customer_id metafield.
  // Always upsert against BUYER email — for gifts we don't want to create
  // a Shopify customer at the recipient's address or pollute the buyer's
  // app-DB row. The recipient is captured on the order's email + shipping
  // fields, not as a separate customer.
  const shippingName = pi.shipping?.name?.split(' ') ?? [];
  const { customerId, shopifyCustomerGid } = await upsertCustomerForStripe({
    email: buyerEmail,
    stripeCustomerId,
    firstName: shippingName[0],
    lastName: shippingName.slice(1).join(' ') || undefined,
  });

  // Resolve cart from PI metadata (set in /api/payment-intent).
  let lineItems: Array<{ price: string; quantity: number }> = [];
  try {
    lineItems = JSON.parse(lineItemsRaw);
  } catch {
    lineItems = [];
  }

  // Hydrate each line from its Stripe Price + Product: name, unit amount and the
  // Shopify variant GID (so the gift order is variant-linked and shippable).
  const resolved = await Promise.all(
    lineItems.map(async (li) => {
      const price = await stripe.prices.retrieve(li.price, { expand: ['product'] });
      const productName =
        typeof price.product === 'object' && !('deleted' in price.product && price.product.deleted)
          ? price.product.name
          : 'Mujo product';
      return { price, productName, quantity: li.quantity };
    }),
  );
  const facts = factsFromGiftPaymentIntent(pi, chargeId, resolved);

  const shippingAddr = pi.shipping?.address;
  const giftMessage = pi.metadata?.gift_message?.trim();
  const orderTags = isGiftOrder
    ? ['stripe-elements', 'one-time', 'on-site-checkout', 'gift']
    : ['stripe-elements', 'one-time', 'on-site-checkout'];
  const orderNote = isGiftOrder
    ? [
        `Stripe PI: ${pi.id} | charge: ${chargeId}`,
        `Gift from: ${buyerEmail}`,
        giftMessage ? `Gift message: "${giftMessage}"` : null,
      ]
        .filter(Boolean)
        .join(' | ')
    : `Stripe PI: ${pi.id} | charge: ${chargeId}`;

  const shopifyOrder = await createMirroredOrder({
    context: '[pi.succeeded]',
    facts,
    base: {
      email: orderEmail,
      customerId: shopifyCustomerGid,
      currency: (pi.currency ?? 'usd').toUpperCase(),
      tags: orderTags,
      note: orderNote,
      shippingAddress: shippingAddr
        ? {
            firstName: shippingName[0],
            lastName: shippingName.slice(1).join(' ') || undefined,
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
          key: 'stripe_payment_intent_id',
          type: 'single_line_text_field',
          value: pi.id,
        },
      ],
    },
  });

  await db.insert(orderMirror).values({
    stripeChargeId: chargeId,
    stripeCheckoutSessionId: null,
    shopifyOrderId: shopifyOrder.legacyResourceId,
    shopifyOrderName: shopifyOrder.name,
    customerId,
    type: 'one_time',
    amountCents: pi.amount,
    currency: (pi.currency ?? 'usd').toLowerCase(),
  });

  console.log('[pi.succeeded] one-time order mirrored', {
    paymentIntentId: pi.id,
    shopifyOrder: shopifyOrder.name,
  });

  // Server-fired analytics. Pixel (client) fires the matching Purchase event
  // with the same event_id from PI metadata; Meta CAPI dedups.
  // For gifts, analytics fire under BUYER email (they're the one converting),
  // not the recipient — recipient gets Shopify shipping notifications.
  const eventId = pi.metadata?.mujo_event_id;
  const analyticsItems = itemsFromPriceIds(
    lineItems.map((li) => ({ priceId: li.price, quantity: li.quantity })),
  );
  const attribution = attributionFromMetadata(pi.metadata);
  const currency = (pi.currency ?? 'usd').toUpperCase();
  const value = pi.amount / 100;

  void trackOrderPlaced({
    email: buyerEmail,
    orderId: shopifyOrder.name,
    value,
    currency,
    items: analyticsItems,
    attribution: klaviyoAttributionProps(attribution),
  }).catch((err) =>
    console.error('[pi.succeeded] Klaviyo Order Placed failed', err),
  );

  if (eventId) {
    void sendCapiEvent({
      eventName: 'Purchase',
      eventId,
      eventSourceUrl: `${SITE_ORIGIN}/checkout`,
      userData: capiUserData(buyerEmail, attribution),
      customData: metaCustomData(analyticsItems, value, currency),
    }).catch((err) =>
      console.error('[pi.succeeded] Meta CAPI Purchase failed', err),
    );
  }
}
