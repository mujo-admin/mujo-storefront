// Extracts OrderFacts — what Stripe actually charged, in integer cents — from
// each of the three payment shapes the storefront produces. The facts feed
// lib/shopify-order-builder.ts, which turns them into a complete Shopify order.
//
//   Checkout Session  → one-time purchases        (checkout-completed.ts)
//   Invoice           → subscription first orders + renewals (invoice-paid.ts)
//   PaymentIntent     → gifts sent from /account  (payment-intent-succeeded.ts)

import type Stripe from 'stripe';
import { stripe } from 'lib/stripe';
import type { FactTax, OrderFacts } from 'lib/shopify-order-builder';

// "IL Sales Tax". Stripe's display_name alone is just "Sales Tax".
function taxTitle(rate: Pick<Stripe.TaxRate, 'state' | 'jurisdiction' | 'display_name'>): string {
  return `${rate.state ?? rate.jurisdiction ?? ''} ${rate.display_name || 'Tax'}`.trim();
}

function taxesFromExpanded(
  taxes: Array<{ amount: number; rate: Stripe.TaxRate }> | null | undefined,
): FactTax[] {
  return (taxes ?? []).map((t) => ({
    title: taxTitle(t.rate),
    ratePercent: t.rate.percentage,
    amountCents: t.amount,
  }));
}

function promotionCodeOf(
  discount: { promotion_code?: string | Stripe.PromotionCode | null } | null | undefined,
): string | undefined {
  const promo = discount?.promotion_code;
  return promo && typeof promo === 'object' ? promo.code : undefined;
}

// --- One-time: Checkout Session ---------------------------------------------

export async function factsFromCheckoutSession(
  session: Stripe.Checkout.Session,
  chargeId: string,
): Promise<{ facts: OrderFacts; lineItems: Stripe.LineItem[] }> {
  const currency = (session.currency ?? 'usd').toUpperCase();

  const [listed, full] = await Promise.all([
    stripe.checkout.sessions.listLineItems(session.id, {
      limit: 100,
      expand: ['data.price.product', 'data.taxes'],
    }),
    // Shipping, tax and discount detail are not inflated on the webhook payload.
    stripe.checkout.sessions.retrieve(session.id, {
      expand: ['shipping_cost.shipping_rate', 'shipping_cost.taxes', 'discounts.promotion_code'],
    }),
  ]);

  const lines: OrderFacts['lines'] = listed.data.map((li) => ({
    variantId:
      typeof li.price === 'object' && li.price
        ? li.price.metadata?.shopify_variant_id || undefined
        : undefined,
    title: li.description ?? 'Item',
    quantity: li.quantity ?? 1,
    subtotalCents: li.amount_subtotal ?? 0,
    taxes: taxesFromExpanded(li.taxes),
  }));

  let shipping: OrderFacts['shipping'];
  const cost = full.shipping_cost;
  if (cost) {
    const rate = cost.shipping_rate;
    shipping = {
      title: (rate && typeof rate === 'object' ? rate.display_name : null) ?? 'Shipping',
      amountCents: cost.amount_subtotal,
      taxes: taxesFromExpanded(cost.taxes),
    };
  }

  let discount: OrderFacts['discount'];
  const discountCents = full.total_details?.amount_discount ?? 0;
  if (discountCents > 0) {
    const first = full.discounts?.[0];
    const coupon = first?.coupon;
    discount = {
      code:
        promotionCodeOf(first) ?? (typeof coupon === 'string' ? coupon : coupon?.id) ?? 'DISCOUNT',
      amountCents: discountCents,
    };
  }

  return {
    facts: {
      currency,
      chargeId,
      totalCents: full.amount_total ?? session.amount_total ?? 0,
      paidAt: new Date(session.created * 1000),
      lines,
      shipping,
      discount,
    },
    lineItems: listed.data,
  };
}

// --- Subscriptions: Invoice --------------------------------------------------

export async function factsFromInvoice(
  invoice: Stripe.Invoice,
  chargeId: string,
  variantGidByPriceId: Map<string, string>,
): Promise<OrderFacts> {
  const currency = (invoice.currency ?? 'usd').toUpperCase();

  // Invoice tax entries carry only the tax-rate ID. Fetch each rate once for
  // its percentage + jurisdiction; fall back to amount ÷ taxable amount.
  const rateCache = new Map<string, Promise<Stripe.TaxRate | null>>();
  const rateFor = (id: string) => {
    let pending = rateCache.get(id);
    if (!pending) {
      pending = stripe.taxRates.retrieve(id).catch((err) => {
        console.error('[order-facts] tax rate retrieve failed', { id, err });
        return null;
      });
      rateCache.set(id, pending);
    }
    return pending;
  };

  const lines: OrderFacts['lines'] = await Promise.all(
    invoice.lines.data.map(async (li) => {
      const priceId =
        typeof li.pricing?.price_details?.price === 'string'
          ? li.pricing.price_details.price
          : undefined;
      const taxes: FactTax[] = [];
      for (const t of li.taxes ?? []) {
        if (t.amount <= 0) continue;
        const rateId = t.tax_rate_details?.tax_rate;
        const rate = rateId ? await rateFor(rateId) : null;
        taxes.push({
          title: rate ? taxTitle(rate) : 'Sales Tax',
          ratePercent: rate
            ? rate.percentage
            : t.taxable_amount
              ? Number(((t.amount / t.taxable_amount) * 100).toFixed(4))
              : 0,
          amountCents: t.amount,
        });
      }
      return {
        variantId: priceId ? variantGidByPriceId.get(priceId) : undefined,
        title: li.description ?? 'Subscription item',
        quantity: li.quantity ?? 1,
        subtotalCents: li.amount,
        taxes,
      };
    }),
  );

  let discount: OrderFacts['discount'];
  const discountCents = (invoice.total_discount_amounts ?? []).reduce(
    (sum, d) => sum + d.amount,
    0,
  );
  if (discountCents > 0) {
    let code = 'DISCOUNT';
    try {
      if (invoice.id) {
        const expanded = await stripe.invoices.retrieve(invoice.id, {
          expand: ['discounts.promotion_code'],
        });
        const first = expanded.discounts?.[0];
        if (first && typeof first === 'object' && !('deleted' in first && first.deleted)) {
          // dahlia: the coupon sits under discount.source.coupon.
          const coupon = first.source?.coupon;
          code =
            promotionCodeOf(first) ?? (typeof coupon === 'string' ? coupon : coupon?.id) ?? code;
        }
      }
    } catch (err) {
      console.error('[order-facts] discount code lookup failed', {
        invoice: invoice.id,
        err,
      });
    }
    discount = { code, amountCents: discountCents };
  }

  // Subscriptions ship free (no shipping_options on the session), so this is
  // not expected — handled so a future paid subscription shipping rate mirrors.
  let shipping: OrderFacts['shipping'];
  if (invoice.shipping_cost) {
    shipping = {
      title: 'Shipping',
      amountCents: invoice.shipping_cost.amount_subtotal,
      taxes: [],
    };
  }

  const paidAt = invoice.status_transitions?.paid_at;

  return {
    currency,
    chargeId,
    totalCents: invoice.amount_paid ?? 0,
    paidAt: paidAt ? new Date(paidAt * 1000) : undefined,
    lines,
    shipping,
    discount,
  };
}

// --- Gifts: PaymentIntent ----------------------------------------------------

// Gifts are a flat off-session charge of the Price's unit amount: no tax, no
// shipping, no discount (see /api/account/subscription/send-gift).
export function factsFromGiftPaymentIntent(
  pi: Stripe.PaymentIntent,
  chargeId: string,
  resolved: Array<{
    price: Stripe.Price;
    productName: string;
    quantity: number;
  }>,
): OrderFacts {
  return {
    currency: (pi.currency ?? 'usd').toUpperCase(),
    chargeId,
    totalCents: pi.amount_received || pi.amount,
    paidAt: new Date(pi.created * 1000),
    lines: resolved.map((r) => ({
      variantId: r.price.metadata?.shopify_variant_id || undefined,
      title: r.productName,
      quantity: r.quantity,
      subtotalCents: (r.price.unit_amount ?? 0) * r.quantity,
      taxes: [],
    })),
  };
}
