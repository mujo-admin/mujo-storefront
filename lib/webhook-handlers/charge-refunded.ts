// Handler: charge.refunded
//
// Light handler — logs the refund for reconciliation. We do NOT auto-cancel or
// auto-edit the corresponding Shopify order from here. Refunds in Stripe should
// be paired with a manual refund / cancellation on the Shopify side via the
// merchant admin to keep accounting clean.

import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, orderMirror } from 'db';

export async function handleChargeRefunded(event: Stripe.Event) {
  if (event.type !== 'charge.refunded') return;
  const charge = event.data.object;
  const refunded = charge.amount_refunded;
  const total = charge.amount;

  const order = (
    await db
      .select()
      .from(orderMirror)
      .where(eq(orderMirror.stripeChargeId, charge.id))
      .limit(1)
  )[0];

  console.log('[charge.refunded]', {
    charge: charge.id,
    refunded,
    total,
    fullyRefunded: refunded === total,
    shopifyOrder: order?.shopifyOrderName ?? null,
  });
}
