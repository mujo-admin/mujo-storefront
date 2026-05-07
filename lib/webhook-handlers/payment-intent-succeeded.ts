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
import { createOrder } from 'lib/shopify-admin';
import { trackOrderPlaced } from 'lib/klaviyo';
import { sendCapiEvent } from 'lib/meta-capi';
import { upsertCustomerForStripe } from './_helpers';

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
  const email = pi.receipt_email ?? null;
  if (!stripeCustomerId || !email) {
    console.error('[pi.succeeded] missing customer linkage', {
      paymentIntentId: pi.id,
      stripeCustomerId,
      email,
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
  const shippingName = pi.shipping?.name?.split(' ') ?? [];
  const { customerId, shopifyCustomerGid } = await upsertCustomerForStripe({
    email,
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

  // Hydrate Shopify line items by fetching the Stripe Price + Product.
  const shopifyOrderLineItems = await Promise.all(
    lineItems.map(async (li) => {
      const price = await stripe.prices.retrieve(li.price, { expand: ['product'] });
      const productName =
        typeof price.product === 'object' && !('deleted' in price.product && price.product.deleted)
          ? price.product.name
          : 'Mujo product';
      const lineAmount = (price.unit_amount ?? 0) * li.quantity;
      return {
        title: productName,
        quantity: li.quantity,
        priceSet: {
          shopMoney: {
            amount: (lineAmount / 100).toFixed(2),
            currencyCode: (pi.currency ?? 'usd').toUpperCase(),
          },
        },
      };
    }),
  );

  const shippingAddr = pi.shipping?.address;
  const shopifyOrder = await createOrder({
    email,
    customerId: shopifyCustomerGid,
    currency: (pi.currency ?? 'usd').toUpperCase(),
    tags: ['stripe-elements', 'one-time', 'on-site-checkout'],
    note: `Stripe PI: ${pi.id} | charge: ${chargeId}`,
    financialStatus: 'PAID',
    lineItems: shopifyOrderLineItems,
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
  const eventId = pi.metadata?.mujo_event_id;
  void trackOrderPlaced({
    email,
    orderId: shopifyOrder.name,
    value: pi.amount / 100,
    currency: (pi.currency ?? 'usd').toUpperCase(),
    items: lineItems.map((li) => ({
      name: li.price,
      quantity: li.quantity,
      priceId: li.price,
    })),
  }).catch((err) =>
    console.error('[pi.succeeded] Klaviyo Order Placed failed', err),
  );

  if (eventId) {
    void sendCapiEvent({
      eventName: 'Purchase',
      eventId,
      userData: { email },
      customData: {
        currency: (pi.currency ?? 'usd').toUpperCase(),
        value: pi.amount / 100,
        num_items: lineItems.length,
        content_ids: lineItems.map((li) => li.price),
      },
    }).catch((err) =>
      console.error('[pi.succeeded] Meta CAPI Purchase failed', err),
    );
  }
}
