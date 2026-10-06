// Stripe vs Shopify, side by side, for one mirrored order.
//
//   pnpm tsx scripts/compare-order.ts ch_123        (charge)
//   pnpm tsx scripts/compare-order.ts cs_test_123   (checkout session)
//   pnpm tsx scripts/compare-order.ts in_123        (invoice)
//
// Prints what Stripe charged and what Shopify recorded, then MATCH or the rows
// that differ. Exit code 1 on a mismatch. Read-only. Uses .env.local (sandbox
// locally); the order is found through the order_mirror table.

import { config } from 'dotenv';
config({ path: '.env.local' });

type Row = { label: string; stripe: string; shopify: string };

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const toCents = (amount: string | null | undefined) => Math.round(Number(amount ?? 0) * 100);

async function main() {
  const id = process.argv[2];
  if (!id) throw new Error('Pass a charge (ch_), checkout session (cs_) or invoice (in_) id.');

  const { stripe } = await import('lib/stripe');
  const { db, orderMirror } = await import('db');
  const { adminFetch } = await import('lib/shopify-admin');
  const { eq } = await import('drizzle-orm');

  const column = id.startsWith('cs_')
    ? orderMirror.stripeCheckoutSessionId
    : id.startsWith('in_')
      ? orderMirror.stripeInvoiceId
      : orderMirror.stripeChargeId;
  const row = (await db.select().from(orderMirror).where(eq(column, id)).limit(1))[0];
  if (!row) throw new Error(`No mirrored order found for ${id}`);

  // --- Stripe side ---
  const charge = await stripe.charges.retrieve(row.stripeChargeId);
  let items = 0;
  let shipping = 0;
  let tax = 0;
  let discount = 0;
  let stripeLines: string[] = [];
  if (row.stripeCheckoutSessionId) {
    const s = await stripe.checkout.sessions.retrieve(row.stripeCheckoutSessionId);
    const li = await stripe.checkout.sessions.listLineItems(s.id, { limit: 100 });
    items = s.amount_subtotal ?? 0;
    shipping = s.total_details?.amount_shipping ?? 0;
    tax = s.total_details?.amount_tax ?? 0;
    discount = s.total_details?.amount_discount ?? 0;
    stripeLines = li.data.map(
      (l) => `${l.quantity} × ${l.description} @ ${usd((l.amount_subtotal ?? 0) / (l.quantity ?? 1))}`,
    );
  } else if (row.stripeInvoiceId) {
    const inv = await stripe.invoices.retrieve(row.stripeInvoiceId);
    items = inv.lines.data.reduce((sum, l) => sum + l.amount, 0);
    tax = (inv.total_taxes ?? []).reduce((sum, t) => sum + t.amount, 0);
    discount = (inv.total_discount_amounts ?? []).reduce((sum, d) => sum + d.amount, 0);
    shipping = inv.shipping_cost?.amount_subtotal ?? 0;
    stripeLines = inv.lines.data.map(
      (l) => `${l.quantity ?? 1} × ${l.description} @ ${usd(l.amount / (l.quantity ?? 1))}`,
    );
  } else {
    items = charge.amount;
    stripeLines = ['(gift PaymentIntent — flat amount)'];
  }

  // --- Shopify side ---
  const data = await adminFetch<{
    order: {
      name: string;
      test: boolean;
      cancelledAt: string | null;
      displayFinancialStatus: string;
      tags: string[];
      subtotalLineItemsQuantity: number;
      totalPriceSet: { shopMoney: { amount: string } };
      totalTaxSet: { shopMoney: { amount: string } };
      totalDiscountsSet: { shopMoney: { amount: string } };
      totalShippingPriceSet: { shopMoney: { amount: string } };
      totalReceivedSet: { shopMoney: { amount: string } };
      totalRefundedSet: { shopMoney: { amount: string } };
      totalOutstandingSet: { shopMoney: { amount: string } };
      discountCodes: string[];
      shippingLines: { nodes: Array<{ title: string }> };
      lineItems: {
        nodes: Array<{
          title: string;
          quantity: number;
          requiresShipping: boolean;
          variant: { id: string } | null;
          originalUnitPriceSet: { shopMoney: { amount: string } };
        }>;
      };
    } | null;
  }>({
    query: /* GraphQL */ `
      query CompareOrder($id: ID!) {
        order(id: $id) {
          name
          test
          cancelledAt
          displayFinancialStatus
          tags
          subtotalLineItemsQuantity
          totalPriceSet { shopMoney { amount } }
          totalTaxSet { shopMoney { amount } }
          totalDiscountsSet { shopMoney { amount } }
          totalShippingPriceSet { shopMoney { amount } }
          totalReceivedSet { shopMoney { amount } }
          totalRefundedSet { shopMoney { amount } }
          totalOutstandingSet { shopMoney { amount } }
          discountCodes
          shippingLines(first: 5) { nodes { title } }
          lineItems(first: 50) {
            nodes {
              title
              quantity
              requiresShipping
              variant { id }
              originalUnitPriceSet { shopMoney { amount } }
            }
          }
        }
      }
    `,
    variables: { id: `gid://shopify/Order/${row.shopifyOrderId}` },
  });
  const order = data.order;
  if (!order) throw new Error(`Shopify order ${row.shopifyOrderName} not found`);

  const shopItems = order.lineItems.nodes.reduce(
    (sum, l) => sum + toCents(l.originalUnitPriceSet.shopMoney.amount) * l.quantity,
    0,
  );
  const net = charge.amount - charge.amount_refunded;
  const rows: Row[] = [
    { label: 'Items', stripe: usd(items), shopify: usd(shopItems) },
    { label: 'Discount', stripe: usd(discount), shopify: usd(toCents(order.totalDiscountsSet.shopMoney.amount)) },
    { label: 'Shipping', stripe: usd(shipping), shopify: usd(toCents(order.totalShippingPriceSet.shopMoney.amount)) },
    { label: 'Tax', stripe: usd(tax), shopify: usd(toCents(order.totalTaxSet.shopMoney.amount)) },
    { label: 'Total', stripe: usd(charge.amount), shopify: usd(toCents(order.totalPriceSet.shopMoney.amount)) },
    { label: 'Paid', stripe: usd(charge.amount_captured), shopify: usd(toCents(order.totalReceivedSet.shopMoney.amount)) },
    { label: 'Refunded', stripe: usd(charge.amount_refunded), shopify: usd(toCents(order.totalRefundedSet.shopMoney.amount)) },
    {
      label: 'Outstanding',
      stripe: usd(0),
      // A fully/partly refunded order legitimately shows nothing owed.
      shopify: usd(Math.max(0, toCents(order.totalOutstandingSet.shopMoney.amount))),
    },
  ];

  console.log(`\n${order.name}  ·  ${order.displayFinancialStatus}${order.test ? '  ·  TEST ORDER' : ''}${order.cancelledAt ? '  ·  CANCELLED' : ''}`);
  console.log(`charge ${charge.id}  ·  net kept ${usd(net)}`);
  console.log(`tags: ${order.tags.join(', ') || '—'}`);
  console.log(`discount codes: ${order.discountCodes.join(', ') || '—'}  ·  shipping: ${order.shippingLines.nodes.map((s) => s.title).join(', ') || '—'}\n`);
  console.log(`${'' .padEnd(13)}${'Stripe'.padStart(10)}${'Shopify'.padStart(10)}`);
  const diffs: string[] = [];
  for (const r of rows) {
    const same = r.stripe === r.shopify;
    if (!same) diffs.push(r.label);
    console.log(`${r.label.padEnd(13)}${r.stripe.padStart(10)}${r.shopify.padStart(10)}  ${same ? '' : '← differs'}`);
  }
  console.log('\nStripe lines:');
  for (const l of stripeLines) console.log(`  ${l}`);
  console.log('Shopify lines:');
  for (const l of order.lineItems.nodes) {
    console.log(
      `  ${l.quantity} × ${l.title} @ $${Number(l.originalUnitPriceSet.shopMoney.amount).toFixed(2)}` +
        `${l.variant ? '' : '  [no variant link]'}${l.requiresShipping ? '' : '  [NOT shippable]'}`,
    );
  }

  const flagged = order.tags.includes('needs-reconciliation');
  if (flagged) diffs.push('tag needs-reconciliation');
  console.log(diffs.length ? `\nMISMATCH: ${diffs.join(', ')}` : '\nMATCH');
  process.exit(diffs.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
