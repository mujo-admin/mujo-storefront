import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { stripe } from 'lib/stripe';
import {
  FREE_SHIPPING_THRESHOLD_CENTS,
  SHIPPING_RATE_EXPRESS_ID,
  SHIPPING_RATE_FLAT_ID,
  SHIPPING_RATE_FREE_ID,
  SUBSCRIPTION_COUPON_ID,
  SUPPRESS_EXPRESS_FOR_MERCH,
  SUPPORTED_COUNTRIES,
} from 'lib/stripe-constants';
import { resolveMerchPriceId } from 'lib/cart/merch-config';
import { trackStartedCheckout } from 'lib/klaviyo';
import { sendCapiEvent } from 'lib/meta-capi';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

type SessionCreateParams = NonNullable<
  Parameters<typeof stripe.checkout.sessions.create>[0]
>;

const lineItemSchema = z.object({
  stripe_price_id: z.string().startsWith('price_'),
  quantity: z.number().int().positive().max(50),
  is_subscription: z.boolean().optional(),
});

const requestSchema = z.object({
  line_items: z.array(lineItemSchema).min(1).max(20),
  customer_email: z.string().email().optional(),
  success_url: z.string().url(),
  cancel_url: z.string().url(),
  metadata: z.record(z.string(), z.string()).optional(),
  client_reference_id: z.string().max(200).optional(),
});

type CheckoutInput = z.infer<typeof requestSchema>;

// Any cart with ≥1 subscription line runs in subscription mode (one-time lines
// ride the first invoice). Previously a mixed cart was rejected with a 400.
function determineMode(input: CheckoutInput): 'payment' | 'subscription' {
  return input.line_items.some((li) => li.is_subscription === true)
    ? 'subscription'
    : 'payment';
}

// See app/api/checkout-session/route.ts for the full rationale. Free shipping
// is earned, never a pickable radio next to a paid Standard; Express is an
// optional paid upgrade, suppressed on merch and only when the rate exists.
function buildShippingOptions(
  subtotalCents: number,
  hasMerch: boolean,
): NonNullable<SessionCreateParams['shipping_options']> {
  const options: NonNullable<SessionCreateParams['shipping_options']> = [];
  const baseRate =
    subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS
      ? SHIPPING_RATE_FREE_ID
      : SHIPPING_RATE_FLAT_ID;
  if (baseRate) options.push({ shipping_rate: baseRate });
  if (SHIPPING_RATE_EXPRESS_ID && !(SUPPRESS_EXPRESS_FOR_MERCH && hasMerch)) {
    options.push({ shipping_rate: SHIPPING_RATE_EXPRESS_ID });
  }
  return options;
}

// Authoritative subtotal from Stripe Prices — never trusted from the client.
async function computeSubtotalCents(
  items: { stripe_price_id: string; quantity: number }[],
): Promise<number> {
  const prices = await Promise.all(
    items.map((i) => stripe.prices.retrieve(i.stripe_price_id)),
  );
  return prices.reduce(
    (sum, price, idx) => sum + (price.unit_amount ?? 0) * (items[idx]?.quantity ?? 0),
    0,
  );
}

export async function POST(req: NextRequest) {
  let parsed: CheckoutInput;
  try {
    const body = await req.json();
    parsed = requestSchema.parse(body);
  } catch (err) {
    return Response.json(
      {
        error: 'invalid_request',
        details: err instanceof z.ZodError ? err.issues : String(err),
      },
      { status: 400 },
    );
  }

  const mode = determineMode(parsed);

  // Dedup layer 1 (see /api/checkout-session for the full rationale): reuse an
  // existing Stripe Customer matched by email instead of letting Stripe create
  // a fresh one per attempt. Keeps repeat submits on one Customer so the
  // customer.subscription.created webhook guard can recognize duplicates.
  let reusedCustomerId: string | undefined;
  if (parsed.customer_email) {
    try {
      const existing = await stripe.customers.list({
        email: parsed.customer_email,
        limit: 1,
      });
      reusedCustomerId = existing.data[0]?.id;
    } catch (err) {
      console.error('[checkout] customer lookup failed', err);
    }
  }

  const params: SessionCreateParams = {
    mode,
    line_items: parsed.line_items.map((li) => ({
      price: li.stripe_price_id,
      quantity: li.quantity,
    })),
    automatic_tax: { enabled: true },
    ...(reusedCustomerId
      ? {
          customer: reusedCustomerId,
          customer_update: { address: 'auto', name: 'auto', shipping: 'auto' },
        }
      : { customer_email: parsed.customer_email }),
    shipping_address_collection: {
      allowed_countries: [...SUPPORTED_COUNTRIES],
    },
    success_url: parsed.success_url,
    cancel_url: parsed.cancel_url,
    metadata: parsed.metadata,
    client_reference_id: parsed.client_reference_id,
    // Lets customers type a code at checkout — the path the first-buyer WELCOME10
    // code (coupon MUJO_FIRST_10, 10% off once, first_time_transaction only) rides
    // on. Removed below on all-subscription carts where the 15% coupon auto-applies.
    allow_promotion_codes: true,
  };

  // INTENTIONAL subscriber free-shipping perk: Stripe rejects shipping_options
  // outside of payment mode, and we deliberately add NO recurring shipping rate
  // to subscriptions — so every subscription order (initial + renewals) ships
  // free regardless of value. Do NOT add subscription shipping here. One-time
  // orders keep the $100 free-ship threshold via buildShippingOptions().
  if (mode === 'payment') {
    let subtotalCents = 0;
    try {
      subtotalCents = await computeSubtotalCents(parsed.line_items);
    } catch (err) {
      console.error(
        '[checkout] subtotal computation failed; defaulting to paid shipping',
        err,
      );
    }
    const hasMerch = parsed.line_items.some(
      (li) => resolveMerchPriceId(li.stripe_price_id) !== null,
    );
    params.shipping_options = buildShippingOptions(subtotalCents, hasMerch);
  } else if (mode === 'subscription') {
    params.subscription_data = { metadata: parsed.metadata };
    // Apply the flat 15%-off MUJO_SUB_15 coupon to ALL subscription checkouts
    // (matches /api/checkout-session). The 10-serving bag has no subscription
    // Price, so an all-subscription cart is always a discountable Ritual sub —
    // and Subscription v2 ships two cadences (4-week + 8-week), both of which
    // must carry the discount; the old single-Price gate silently dropped it
    // for the 8-week Price. Stripe rejects combining discounts[] with
    // allow_promotion_codes, so honor the explicit coupon over the promo field.
    if (SUBSCRIPTION_COUPON_ID) {
      params.discounts = [{ coupon: SUBSCRIPTION_COUPON_ID }];
      delete params.allow_promotion_codes;
    }
  }

  try {
    const session = await stripe.checkout.sessions.create(params);
    if (!session.url) {
      return Response.json({ error: 'stripe_no_url' }, { status: 502 });
    }

    // Fire-and-forget analytics — never block Stripe response.
    const eventId = randomUUID();
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const userAgent = req.headers.get('user-agent') ?? undefined;
    const cartValue = parsed.line_items.reduce((s, li) => s + li.quantity, 0);

    if (parsed.customer_email) {
      void trackStartedCheckout({
        email: parsed.customer_email,
        value: cartValue,
        currency: 'USD',
        items: parsed.line_items.map((li) => ({
          name: li.stripe_price_id,
          quantity: li.quantity,
          priceId: li.stripe_price_id,
          isSubscription: li.is_subscription === true,
        })),
      }).catch((err) => console.error('[checkout] Klaviyo track failed', err));
    }

    void sendCapiEvent({
      eventName: 'InitiateCheckout',
      eventId,
      eventSourceUrl: parsed.cancel_url,
      userData: {
        email: parsed.customer_email,
        clientIpAddress: ip,
        clientUserAgent: userAgent,
      },
      customData: {
        currency: 'USD',
        num_items: parsed.line_items.length,
        content_ids: parsed.line_items.map((li) => li.stripe_price_id),
      },
    }).catch((err) => console.error('[checkout] Meta CAPI failed', err));

    return Response.json({
      url: session.url,
      session_id: session.id,
      event_id: eventId,
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      const code = err.code ?? 'stripe_error';
      const status = err.statusCode ?? 502;
      console.error('[checkout] Stripe error', { code, message: err.message });
      return Response.json(
        { error: code, message: err.message },
        { status: status >= 400 && status < 500 ? 400 : 502 },
      );
    }
    console.error('[checkout] Unexpected error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
