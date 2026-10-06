// Handler: invoice.paid
//
// Fires on every successful subscription charge — initial (subscription_create),
// renewal (subscription_cycle), and mid-cycle plan changes (subscription_update).
// Creates a Shopify order tagged appropriately and upserts the subscription row.

import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, orderMirror, subscriptions } from 'db';
import { stripe } from 'lib/stripe';
import type { CreateOrderInput } from 'lib/shopify-admin';
import {
  FIRST_ORDER_FROTHER_GIFT_ENABLED,
  FROTHER_GIFT_PRICE_ID,
  FROTHER_GIFT_VARIANT_GID,
  isRitualSubscriptionPrice,
} from 'lib/stripe-constants';
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
import {
  createMirroredOrder,
  echoSubscriptionStatusToShopify,
  extractInvoicePaymentIntentId,
  extractInvoiceSubscriptionId,
  extractSubscriptionPeriod,
  normalizeSubscriptionStatus,
  upsertCustomerForStripe,
} from './_helpers';
import { factsFromInvoice } from './_order-facts';

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
  // Protein Powder pre-order: the subscription starts in a trial until ship day
  // (see /api/checkout-session), so signup produces a $0 invoice with no charge
  // (handled by the no-charge early return below) and the FIRST real charge
  // arrives as billing_reason=subscription_cycle. Treated as the initial order.
  const isPreorder = sub.metadata?.preorder === 'protein-powder';

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

  if (isPreorder && type === 'subscription_renewal') {
    const priorOrders = await db
      .select({ id: orderMirror.id })
      .from(orderMirror)
      .where(eq(orderMirror.stripeSubscriptionId, stripeSubscriptionId))
      .limit(1);
    if (priorOrders.length === 0) type = 'subscription_initial';
  }

  // Build line items from the invoice
  const currencyCode = (invoice.currency ?? 'usd').toUpperCase();

  // Resolve a Shopify variant GID for each line's Stripe Price so the mirrored
  // order is variant-linked (inventory + fulfilment). This is what lets a
  // one-time merch item bought alongside a subscription actually ship via
  // Printify — without it the line is title-only and never fulfils. dahlia:
  // the line's price is an ID string at pricing.price_details.price, so we
  // retrieve it to read metadata.shopify_variant_id (mirror writes it).
  const priceIdOf = (li: (typeof invoice.lines.data)[number]): string | undefined =>
    typeof li.pricing?.price_details?.price === 'string'
      ? li.pricing.price_details.price
      : undefined;
  const linePriceIds = Array.from(
    new Set(invoice.lines.data.map(priceIdOf).filter((id): id is string => !!id)),
  );
  const variantGidByPriceId = new Map<string, string>();
  await Promise.all(
    linePriceIds.map(async (priceId) => {
      try {
        const price = await stripe.prices.retrieve(priceId);
        const gid = price.metadata?.shopify_variant_id;
        if (gid) variantGidByPriceId.set(priceId, gid);
      } catch (err) {
        console.error('[invoice.paid] price retrieve failed for variant link', {
          priceId,
          err,
        });
      }
    }),
  );

  // Everything Stripe charged on this invoice — items, tax, discount — as facts
  // the shared builder turns into a complete Shopify order (per-unit prices,
  // clean titles, tax lines, the payment itself).
  const facts = await factsFromInvoice(invoice, chargeId, variantGidByPriceId);

  // First-order subscriber gift: a free frother ships with the FIRST subscription
  // order only (subscription_initial); renewals (subscription_cycle) and plan
  // changes (subscription_update) never get it.
  //
  // The gift now arrives as a real $0 line on the first invoice — the Checkout
  // Session appends a $0 frother Price as a one-time line_item (see
  // app/api/checkout-session), so `lineItems` (built from invoice.lines above) is
  // already variant-linked and $0. We just detect it for the tag. The manual
  // append below is a FALLBACK for a first order whose checkout did not include
  // the $0 line (e.g. the legacy /api/checkout shim, or an in-flight session
  // created before this shipped) — so there is always exactly one frother, never
  // two. Idempotent overall via the stripeChargeId order-mirror guard.
  const frotherInInvoice =
    !!FROTHER_GIFT_PRICE_ID &&
    invoice.lines.data.some((li) => priceIdOf(li) === FROTHER_GIFT_PRICE_ID);
  let frotherGifted = frotherInInvoice;
  if (
    type === 'subscription_initial' &&
    FIRST_ORDER_FROTHER_GIFT_ENABLED &&
    !frotherInInvoice &&
    // Ritual subscriptions only — never Protein Powder.
    isRitualSubscriptionPrice(stripePriceId)
  ) {
    facts.lines.push({
      ...(FROTHER_GIFT_VARIANT_GID ? { variantId: FROTHER_GIFT_VARIANT_GID } : {}),
      title: 'Electric Frother',
      quantity: 1,
      subtotalCents: 0,
      taxes: [],
    });
    frotherGifted = true;
  }

  // Subscription invoices don't carry a shipping address the way a Checkout Session
  // does, so the mirror order used to land with no address — un-shippable. Pull the
  // shipping details off the Stripe Customer (Checkout writes them there for
  // subscriptions) and map to Shopify's shape. Falls back to undefined (prior
  // behavior) if the customer has no shipping on file.
  let shippingAddress: CreateOrderInput['shippingAddress'];
  try {
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    const ship =
      customer && !customer.deleted
        ? customer.shipping ?? (customer.address ? { name: customer.name, phone: customer.phone, address: customer.address } : null)
        : null;
    if (ship?.address) {
      const nameParts = (ship.name ?? '').split(' ');
      shippingAddress = {
        firstName: nameParts[0] || undefined,
        lastName: nameParts.slice(1).join(' ') || undefined,
        address1: ship.address.line1 ?? undefined,
        address2: ship.address.line2 ?? undefined,
        city: ship.address.city ?? undefined,
        province: ship.address.state ?? undefined,
        country: ship.address.country ?? undefined,
        zip: ship.address.postal_code ?? undefined,
        phone: ship.phone ?? undefined,
      };
    }
  } catch (err) {
    console.error('[invoice.paid] could not resolve shipping address', { customer: stripeCustomerId, err });
  }

  const shopifyOrder = await createMirroredOrder({
    context: '[invoice.paid]',
    facts,
    base: {
      email,
      customerId: shopifyCustomerGid,
      currency: currencyCode,
      shippingAddress,
      tags: frotherGifted ? [...tagsFor(type), 'free-frother-gift'] : tagsFor(type),
      note:
        `Stripe invoice: ${invoice.id} | subscription: ${stripeSubscriptionId} | charge: ${chargeId}` +
        (frotherGifted ? ' | includes free welcome frother' : ''),
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
    },
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

  // Server-fired analytics for the subscription initial purchase. Matches the
  // one-time path in checkout-completed.ts / payment-intent-succeeded.ts so
  // Klaviyo "Order Placed" + Meta CAPI "Purchase" cover both buyer journeys.
  // Gated to subscription_create only — renewals and plan changes mirror to
  // order_mirror + Shopify but don't re-fire Purchase (renewal ≠ conversion).
  // event_id comes from sub.metadata.mujo_event_id (set in /api/checkout-session
  // subscription_data.metadata at session-create time); Pixel on /checkout/success
  // fires with the same id for dedup.
  if (type === 'subscription_initial') {
    // Items use catalog IDs; the free first-order frother is dropped (a gift
    // is not a purchased product). The shopper's ad click was saved on the
    // subscription's metadata at checkout.
    const analyticsItems = itemsFromPriceIds(
      invoice.lines.data.map((li) => ({
        priceId: priceIdOf(li) ?? '',
        quantity: li.quantity ?? 1,
        amountCents: li.amount,
      })),
    );
    const attribution = attributionFromMetadata(sub.metadata);
    const currency = (invoice.currency ?? 'usd').toUpperCase();
    const value = (invoice.amount_paid ?? 0) / 100;

    // Awaited, not fire-and-forget: on serverless the function can be frozen the
    // moment the handler returns, which silently dropped about half of these
    // (September: 2 "Order Placed" events for 4 orders). Failures are caught and
    // logged, so analytics can never fail the order.
    const eventId =
      typeof sub.metadata?.mujo_event_id === 'string'
        ? sub.metadata.mujo_event_id
        : undefined;
    // Pre-orders already reported the conversion at signup (Pixel on
    // /checkout/success); the ship-day charge is weeks later, outside Meta's
    // dedup window, so re-sending Purchase would double count.
    const sendPurchase = Boolean(eventId) && !isPreorder;
    await Promise.allSettled([
      trackOrderPlaced({
        email,
        orderId: shopifyOrder.name,
        value,
        currency,
        items: analyticsItems,
        attribution: klaviyoAttributionProps(attribution),
      }).catch((err) =>
        console.error('[invoice.paid] Klaviyo Order Placed failed', err),
      ),
      sendPurchase && eventId
        ? sendCapiEvent({
            eventName: 'Purchase',
            eventId,
            eventSourceUrl: `${SITE_ORIGIN}/checkout`,
            userData: capiUserData(email, attribution),
            customData: metaCustomData(analyticsItems, value, currency),
          }).catch((err) =>
            console.error('[invoice.paid] Meta CAPI Purchase failed', err),
          )
        : Promise.resolve(),
    ]);
    console.log('[invoice.paid] analytics sent', {
      invoice: invoice.id,
      klaviyo: true,
      metaPurchase: sendPurchase,
    });
  }
}
