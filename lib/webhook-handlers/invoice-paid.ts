// Handler: invoice.paid
//
// Fires on every successful subscription charge — initial (subscription_create),
// renewal (subscription_cycle), and mid-cycle plan changes (subscription_update).
// Creates a Shopify order tagged appropriately and upserts the subscription row.

import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, orderMirror, subscriptions } from 'db';
import { stripe } from 'lib/stripe';
import { createOrder } from 'lib/shopify-admin';
import {
  echoSubscriptionStatusToShopify,
  extractInvoicePaymentIntentId,
  extractInvoiceSubscriptionId,
  extractSubscriptionPeriod,
  normalizeSubscriptionStatus,
  upsertCustomerForStripe,
} from './_helpers';

type OrderType = 'subscription_initial' | 'subscription_renewal' | 'subscription_update';

function tagsFor(type: OrderType): string[] {
  if (type === 'subscription_initial') return ['stripe-checkout', 'subscription-initial'];
  if (type === 'subscription_renewal') return ['stripe-checkout', 'subscription-renewal'];
  return ['stripe-checkout', 'subscription-update'];
}

export async function handleInvoicePaid(event: Stripe.Event) {
  if (event.type !== 'invoice.paid') return;
  const invoice = event.data.object;

  const stripeSubscriptionId = extractInvoiceSubscriptionId(invoice);
  if (!stripeSubscriptionId) {
    console.log('[invoice.paid] non-subscription invoice, skipping', { invoice: invoice.id });
    return;
  }

  const stripeCustomerId =
    typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
  const email = invoice.customer_email ?? null;

  if (!stripeCustomerId || !email) {
    console.error('[invoice.paid] missing customer linkage', { invoice: invoice.id });
    return;
  }

  const { customerId, shopifyCustomerGid } = await upsertCustomerForStripe({
    email,
    stripeCustomerId,
  });

  const reason = invoice.billing_reason;
  let type: OrderType;
  if (reason === 'subscription_create') type = 'subscription_initial';
  else if (reason === 'subscription_update') type = 'subscription_update';
  else if (reason === 'subscription_cycle') type = 'subscription_renewal';
  else {
    console.log('[invoice.paid] non-subscription billing_reason, skipping', { reason });
    return;
  }

  // Fetch the subscription so we can mirror current period + price id
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const period = extractSubscriptionPeriod(sub);
  const stripePriceId = sub.items.data[0]?.price.id ?? '';

  const existingSub = (
    await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1)
  )[0];

  if (!existingSub) {
    await db.insert(subscriptions).values({
      stripeSubscriptionId,
      customerId,
      status: normalizeSubscriptionStatus(sub.status),
      stripePriceId,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      pausedAt: sub.pause_collection ? new Date() : null,
      metadata: sub.metadata ?? {},
    });
  } else {
    await db
      .update(subscriptions)
      .set({
        status: normalizeSubscriptionStatus(sub.status),
        stripePriceId,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
        pausedAt: sub.pause_collection ? new Date() : null,
        metadata: sub.metadata ?? {},
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, existingSub.id));
  }

  await echoSubscriptionStatusToShopify(
    shopifyCustomerGid,
    normalizeSubscriptionStatus(sub.status),
    period.end,
  );

  // Resolve charge id via payments → payment_intent → latest_charge
  const paymentIntentId = await extractInvoicePaymentIntentId(invoice, stripe);
  let chargeId: string | undefined;
  if (paymentIntentId) {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    });
    const latest = pi.latest_charge;
    chargeId = typeof latest === 'string' ? latest : latest?.id;
  }
  if (!chargeId) {
    console.error('[invoice.paid] no charge id resolvable', { invoice: invoice.id });
    return;
  }

  // Idempotency: have we already mirrored this charge?
  const existingOrder = await db
    .select({ id: orderMirror.id })
    .from(orderMirror)
    .where(eq(orderMirror.stripeChargeId, chargeId))
    .limit(1);
  if (existingOrder.length > 0) {
    console.log('[invoice.paid] order already mirrored, skipping', { chargeId });
    return;
  }

  // Build line items from the invoice
  const lineItems = invoice.lines.data.map((li) => ({
    title: li.description ?? 'Subscription item',
    quantity: li.quantity ?? 1,
    priceSet: {
      shopMoney: {
        amount: (li.amount / 100).toFixed(2),
        currencyCode: (li.currency ?? 'USD').toUpperCase(),
      },
    },
  }));

  const shopifyOrder = await createOrder({
    email,
    customerId: shopifyCustomerGid,
    currency: (invoice.currency ?? 'usd').toUpperCase(),
    tags: tagsFor(type),
    note: `Stripe invoice: ${invoice.id} | subscription: ${stripeSubscriptionId} | charge: ${chargeId}`,
    financialStatus: 'PAID',
    lineItems,
    metafields: [
      {
        namespace: 'mujo_commerce',
        key: 'stripe_charge_id',
        type: 'single_line_text_field',
        value: chargeId,
      },
      {
        namespace: 'mujo_commerce',
        key: 'stripe_invoice_id',
        type: 'single_line_text_field',
        value: invoice.id ?? '',
      },
      {
        namespace: 'mujo_commerce',
        key: 'stripe_subscription_id',
        type: 'single_line_text_field',
        value: stripeSubscriptionId,
      },
      {
        namespace: 'mujo_commerce',
        key: 'billing_reason',
        type: 'single_line_text_field',
        value: reason ?? '',
      },
    ],
  });

  await db.insert(orderMirror).values({
    stripeChargeId: chargeId,
    stripeInvoiceId: invoice.id ?? null,
    stripeSubscriptionId,
    shopifyOrderId: shopifyOrder.legacyResourceId,
    shopifyOrderName: shopifyOrder.name,
    customerId,
    type,
    amountCents: invoice.amount_paid ?? 0,
    currency: (invoice.currency ?? 'usd').toLowerCase(),
  });

  console.log('[invoice.paid] order mirrored', {
    invoice: invoice.id,
    type,
    shopifyOrder: shopifyOrder.name,
  });
}
