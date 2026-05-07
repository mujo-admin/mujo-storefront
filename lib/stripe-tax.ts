// Stripe Tax wrapper for the on-site checkout flow.
//
// Why: <AddressElement /> fires onChange on every keystroke. Hitting Stripe
// Tax API every keystroke is wasteful + slow. The client debounces 600ms
// before calling /api/tax/calculate, which calls calculateTax() here. We
// also LRU-cache by SHA-256(address + items) for 60s so re-mounts and
// back-button traffic don't re-bill the calculation.
//
// Stripe Tax: txcd_41054002 (Powdered Drink Mixes - Water) for Ritual /
// Vitality Brew per HISTORY 2026-05-07. Tax codes live on Stripe Products,
// not Prices, so this wrapper is product-tax-code agnostic — Stripe fills
// in the right rate based on customer address × product tax code.

import { createHash } from 'node:crypto';
import type Stripe from 'stripe';
import { stripe } from 'lib/stripe';
import type { CartLineItem } from 'lib/cart/types';

export type TaxAddress = {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
};

export type TaxResult = {
  taxCents: number;
  calculationId: string;
  /** Echoes the items + shipping subtotals seen by Stripe Tax. */
  totals: {
    subtotalCents: number;
    shippingCents: number;
    /** Stripe-computed total = subtotal + shipping + tax. */
    totalCents: number;
  };
};

type CacheEntry = {
  result: TaxResult;
  expiresAt: number;
};

const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX_ENTRIES = 100;
const cache = new Map<string, CacheEntry>();

function cacheKey(items: CartLineItem[], address: TaxAddress, shippingCents: number): string {
  const items_snapshot = items
    .map((i) => `${i.stripePriceId}:${i.quantity}:${i.unitAmountCents}`)
    .sort()
    .join('|');
  const addr = [
    address.line1,
    address.line2 ?? '',
    address.city,
    address.state,
    address.postal_code,
    address.country,
  ].join('|');
  const raw = `${items_snapshot}::${addr}::ship=${shippingCents}`;
  return createHash('sha256').update(raw).digest('hex');
}

function evictExpired() {
  const now = Date.now();
  for (const [k, v] of cache.entries()) {
    if (v.expiresAt < now) cache.delete(k);
  }
}

function evictOldest() {
  const overflow = cache.size - CACHE_MAX_ENTRIES;
  if (overflow <= 0) return;
  const keysIter = cache.keys();
  for (let i = 0; i < overflow; i++) {
    const next = keysIter.next();
    if (next.done) break;
    cache.delete(next.value);
  }
}

/**
 * Resolve the Stripe Product ID for a Price ID. Stripe Tax wants
 * `tax_code` per line item; we read it off the Product.
 */
function readTaxCode(
  taxCode: string | { id: string } | null | undefined,
): string | undefined {
  if (typeof taxCode === 'string') return taxCode;
  if (taxCode && typeof taxCode === 'object') return taxCode.id;
  return undefined;
}

async function resolveProductForPrice(stripePriceId: string): Promise<{
  productId: string;
  taxCode?: string;
}> {
  const price = await stripe.prices.retrieve(stripePriceId, {
    expand: ['product'],
  });
  if (typeof price.product === 'string') {
    const product = await stripe.products.retrieve(price.product);
    return { productId: product.id, taxCode: readTaxCode(product.tax_code) };
  }
  if (price.product && !('deleted' in price.product && price.product.deleted)) {
    const product = price.product;
    return { productId: product.id, taxCode: readTaxCode(product.tax_code) };
  }
  return { productId: '' };
}

export async function calculateTax(args: {
  items: CartLineItem[];
  shippingAddress: TaxAddress;
  shippingCents: number;
}): Promise<TaxResult> {
  const { items, shippingAddress, shippingCents } = args;

  evictExpired();
  const key = cacheKey(items, shippingAddress, shippingCents);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  // Build line_items for the calculation. We pass amounts in cents that
  // already match the cart; Stripe Tax computes tax on top, not embedded.
  type CalcLineItem = NonNullable<
    Parameters<typeof stripe.tax.calculations.create>[0]['line_items']
  >[number];
  const lineItems: CalcLineItem[] = await Promise.all(
    items.map(async (item): Promise<CalcLineItem> => {
      const { taxCode } = await resolveProductForPrice(item.stripePriceId);
      const li: CalcLineItem = {
        amount: item.unitAmountCents * item.quantity,
        reference: item.stripePriceId,
        quantity: item.quantity,
      };
      if (taxCode) li.tax_code = taxCode;
      return li;
    }),
  );

  const calc = await stripe.tax.calculations.create({
    currency: 'usd',
    line_items: lineItems,
    shipping_cost: shippingCents > 0 ? { amount: shippingCents } : undefined,
    customer_details: {
      address: {
        line1: shippingAddress.line1,
        line2: shippingAddress.line2 ?? undefined,
        city: shippingAddress.city,
        state: shippingAddress.state,
        postal_code: shippingAddress.postal_code,
        country: shippingAddress.country,
      },
      address_source: 'shipping',
    },
  });

  const taxCents = calc.tax_amount_exclusive ?? 0;
  const subtotalCentsValue = items.reduce(
    (s, i) => s + i.unitAmountCents * i.quantity,
    0,
  );
  const result: TaxResult = {
    taxCents,
    calculationId: calc.id ?? '',
    totals: {
      subtotalCents: subtotalCentsValue,
      shippingCents,
      totalCents: subtotalCentsValue + shippingCents + taxCents,
    },
  };

  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  evictOldest();

  return result;
}
