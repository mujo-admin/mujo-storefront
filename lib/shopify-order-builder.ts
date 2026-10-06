// Turns what Stripe charged into the money fields of a Shopify order.
//
// Stripe is where the money moves; Shopify is where the order is fulfilled and
// exported for accounting. Every mirrored order must be a faithful copy: the
// payment attached, shipping and tax as real lines, any promo code as a
// discount, and a per-unit price. The three webhook handlers each extract
// OrderFacts (lib/webhook-handlers/_order-facts.ts) and this module does the
// rest, so the arithmetic lives — and is tested — in one place.
//
// Pure: no network, no env. All amounts are integer cents.

import type { CreateOrderInput, ShopifyTaxLineInput } from 'lib/shopify-admin';

export type FactTax = {
  title: string;
  ratePercent: number;
  amountCents: number;
};

export type OrderFacts = {
  currency: string; // 'USD'
  chargeId: string;
  /** What Stripe actually charged. */
  totalCents: number;
  paidAt?: Date;
  lines: Array<{
    variantId?: string;
    /** Raw Stripe description / product name. */
    title: string;
    quantity: number;
    /** Before discount and tax, for the whole line. */
    subtotalCents: number;
    taxes: FactTax[];
  }>;
  shipping?: { title: string; amountCents: number; taxes: FactTax[] };
  discount?: { code: string; amountCents: number };
};

export type BuiltOrderMoneyFields = Pick<
  CreateOrderInput,
  'lineItems' | 'shippingLines' | 'discountCode' | 'transactions' | 'test' | 'processedAt'
> & {
  computedTotalCents: number;
  matches: boolean;
};

export function centsToAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Stripe words a subscription invoice line as
// "1 × The Ritual (at $50.00 / every 4 weeks)". Shopify should just say
// "The Ritual". One-time descriptions are already the plain product name.
export function cleanLineTitle(raw: string): string {
  const match = raw.trim().match(/^\d+\s*×\s*(.+?)\s*\(at .*\)$/);
  return (match?.[1] ?? raw).trim();
}

function taxLines(taxes: FactTax[], currency: string): ShopifyTaxLineInput[] | undefined {
  const lines = taxes
    .filter((t) => t.amountCents > 0)
    .map((t) => ({
      title: t.title,
      rate: Number((t.ratePercent / 100).toFixed(6)),
      priceSet: {
        shopMoney: {
          amount: centsToAmount(t.amountCents),
          currencyCode: currency,
        },
      },
    }));
  return lines.length ? lines : undefined;
}

/** Line items in Shopify's shape: cleaned title, per-unit price, shippable. */
export function buildLineItems(
  facts: Pick<OrderFacts, 'lines' | 'currency'>,
  opts: { withTax: boolean },
): CreateOrderInput['lineItems'] {
  return facts.lines.map((line) => {
    const quantity = Math.max(1, line.quantity);
    const tax = opts.withTax ? taxLines(line.taxes, facts.currency) : undefined;
    return {
      ...(line.variantId ? { variantId: line.variantId } : {}),
      title: cleanLineTitle(line.title),
      quantity,
      // All Mujo products are physical goods; orderCreate defaults to false.
      requiresShipping: true,
      // Shopify multiplies priceSet by quantity, so this must be per unit.
      priceSet: {
        shopMoney: {
          amount: centsToAmount(Math.round(line.subtotalCents / quantity)),
          currencyCode: facts.currency,
        },
      },
      ...(tax ? { taxLines: tax } : {}),
    };
  });
}

export function buildOrderMoneyFields(
  facts: OrderFacts,
  opts: { isLive: boolean },
): BuiltOrderMoneyFields {
  const { currency } = facts;
  const money = (cents: number) => ({
    shopMoney: { amount: centsToAmount(cents), currencyCode: currency },
  });

  const lineItems = buildLineItems(facts, { withTax: true });

  const shippingTax = facts.shipping ? taxLines(facts.shipping.taxes, currency) : undefined;
  const shippingLines = facts.shipping
    ? [
        {
          title: facts.shipping.title,
          priceSet: money(facts.shipping.amountCents),
          ...(shippingTax ? { taxLines: shippingTax } : {}),
        },
      ]
    : undefined;

  const discountCode =
    facts.discount && facts.discount.amountCents > 0
      ? {
          itemFixedDiscountCode: {
            code: facts.discount.code,
            amountSet: money(facts.discount.amountCents),
          },
        }
      : undefined;

  // Shopify rejects an order dated in the future. Clock skew (or a sandbox test
  // clock) can put Stripe's timestamp ahead of now — then let Shopify stamp it.
  const processedAt =
    facts.paidAt && facts.paidAt.getTime() <= Date.now() ? facts.paidAt.toISOString() : undefined;

  const transactions: NonNullable<CreateOrderInput['transactions']> = [
    {
      kind: 'SALE',
      status: 'SUCCESS',
      gateway: 'Stripe',
      authorizationCode: facts.chargeId,
      amountSet: money(facts.totalCents),
      ...(processedAt ? { processedAt } : {}),
      ...(opts.isLive ? {} : { test: true }),
    },
  ];

  // Use the rounded per-unit prices we actually send, so a line that does not
  // divide evenly shows up as a mismatch instead of hiding.
  const itemsCents = facts.lines.reduce((sum, line) => {
    const quantity = Math.max(1, line.quantity);
    return sum + Math.round(line.subtotalCents / quantity) * quantity;
  }, 0);
  const sumTax = (taxes: FactTax[]) =>
    taxes.reduce((sum, t) => sum + Math.max(0, t.amountCents), 0);
  const taxCents =
    facts.lines.reduce((sum, line) => sum + sumTax(line.taxes), 0) +
    (facts.shipping ? sumTax(facts.shipping.taxes) : 0);
  const computedTotalCents =
    itemsCents - (facts.discount?.amountCents ?? 0) + (facts.shipping?.amountCents ?? 0) + taxCents;

  return {
    lineItems,
    ...(shippingLines ? { shippingLines } : {}),
    ...(discountCode ? { discountCode } : {}),
    transactions,
    ...(opts.isLive ? {} : { test: true }),
    ...(processedAt ? { processedAt } : {}),
    computedTotalCents,
    matches: computedTotalCents === facts.totalCents,
  };
}
