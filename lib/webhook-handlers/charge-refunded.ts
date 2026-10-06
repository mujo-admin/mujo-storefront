// Handler: charge.refunded
//
// Mirrors a Stripe refund onto the matching Shopify order so the two agree:
// an amount-only refund against the order's recorded Stripe payment. Nothing is
// restocked and the customer gets no Shopify email (Stripe moved the money and
// sends its own notice). The order is tagged `stripe-refunded` so a refunded
// order that has not shipped yet is visible in the fulfilment list — it is NOT
// auto-cancelled.
//
// Orders mirrored before payments were recorded (pre 2026-10) have no Shopify
// transaction to refund against; those are logged and skipped.

import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db, orderMirror } from 'db';
import {
  addOrderTags,
  createRefund,
  getOrderForRefund,
  ShopifyAdminError,
} from 'lib/shopify-admin';
import { centsToAmount } from 'lib/shopify-order-builder';

export async function handleChargeRefunded(event: Stripe.Event) {
  if (event.type !== 'charge.refunded') return;
  const charge = event.data.object;

  const row = (
    await db
      .select()
      .from(orderMirror)
      .where(eq(orderMirror.stripeChargeId, charge.id))
      .limit(1)
  )[0];

  if (!row) {
    console.log('[charge.refunded] no mirrored order for charge, skipping', {
      charge: charge.id,
    });
    return;
  }

  const orderGid = `gid://shopify/Order/${row.shopifyOrderId}`;

  try {
    const order = await getOrderForRefund(orderGid);
    if (!order) {
      console.error('[charge.refunded] Shopify order not found', {
        charge: charge.id,
        shopifyOrder: row.shopifyOrderName,
      });
      return;
    }

    const sale = order.transactions.find((t) => t.kind === 'SALE' && t.status === 'SUCCESS');
    if (!sale) {
      console.log('[charge.refunded] pre-fix order (no payment recorded), refund not mirrored', {
        charge: charge.id,
        shopifyOrder: order.name,
        refunded: charge.amount_refunded,
      });
      return;
    }

    // charge.amount_refunded is cumulative. Mirror only what Shopify does not
    // have yet — safe for repeat deliveries and for several partial refunds.
    const alreadyCents = Math.round(Number(order.totalRefundedSet.shopMoney.amount) * 100);
    const deltaCents = charge.amount_refunded - alreadyCents;
    if (deltaCents <= 0) {
      console.log('[charge.refunded] already mirrored, skipping', {
        charge: charge.id,
        shopifyOrder: order.name,
      });
      return;
    }

    await createRefund({
      orderGid,
      parentTransactionGid: sale.id,
      amount: centsToAmount(deltaCents),
      currency: charge.currency.toUpperCase(),
      gateway: sale.gateway ?? 'Stripe',
      note: `Stripe refund on ${charge.id}`,
      // Cumulative refunded amount makes each successive refund a distinct key.
      idempotencyKey: `${charge.id}-${charge.amount_refunded}`,
    });
    await addOrderTags(orderGid, ['stripe-refunded']);

    console.log('[charge.refunded] refund mirrored', {
      charge: charge.id,
      shopifyOrder: order.name,
      refundedNow: deltaCents,
      refundedTotal: charge.amount_refunded,
      fullyRefunded: charge.amount_refunded === charge.amount,
    });
  } catch (err) {
    // A rejection from Shopify will not succeed on retry — log it and let the
    // daily Stripe-vs-Shopify check report the gap. Network errors rethrow so
    // Stripe retries the webhook.
    if (err instanceof ShopifyAdminError && err.userErrors?.length) {
      console.error('[charge.refunded] Shopify rejected the refund', {
        charge: charge.id,
        shopifyOrder: row.shopifyOrderName,
        userErrors: err.userErrors,
      });
      return;
    }
    throw err;
  }
}
