// Handler: customer.subscription.updated and customer.subscription.deleted
//
// Mirrors Stripe subscription state into our DB + echoes to Shopify customer
// metafields. Does NOT create orders — invoice.paid does that.

import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, customers, subscriptions } from 'db';
import {
  echoSubscriptionStatusToShopify,
  extractSubscriptionPeriod,
  normalizeSubscriptionStatus,
} from './_helpers';

export async function handleSubscriptionUpdated(event: Stripe.Event) {
  if (
    event.type !== 'customer.subscription.updated' &&
    event.type !== 'customer.subscription.deleted'
  ) {
    return;
  }
  const sub = event.data.object;

  const stripeCustomerId =
    typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  const customerRow = (
    await db
      .select()
      .from(customers)
      .where(eq(customers.stripeCustomerId, stripeCustomerId))
      .limit(1)
  )[0];

  if (!customerRow) {
    console.error('[subscription.updated] no app-DB customer for stripe customer', {
      stripeCustomerId,
      stripeSubscriptionId: sub.id,
    });
    return;
  }

  const period = extractSubscriptionPeriod(sub);
  const stripePriceId = sub.items.data[0]?.price.id ?? '';

  const status =
    event.type === 'customer.subscription.deleted'
      ? 'canceled'
      : normalizeSubscriptionStatus(sub.status);

  const existing = (
    await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, sub.id))
      .limit(1)
  )[0];

  if (!existing) {
    await db.insert(subscriptions).values({
      stripeSubscriptionId: sub.id,
      customerId: customerRow.id,
      status,
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
        status,
        stripePriceId,
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
        pausedAt: sub.pause_collection ? new Date() : null,
        metadata: sub.metadata ?? {},
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, existing.id));
  }

  if (customerRow.shopifyCustomerId) {
    await echoSubscriptionStatusToShopify(
      customerRow.shopifyCustomerId,
      status,
      period.end,
    );
  }

  console.log('[subscription.updated]', {
    sub: sub.id,
    status,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
  });
}
