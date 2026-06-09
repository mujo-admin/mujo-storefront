import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { stripe } from 'lib/stripe';
import {
  RITUAL_PRICE_IDS,
  SHIPPING_RATE_FLAT_ID,
  SHIPPING_RATE_FREE_ID,
  SUBSCRIPTION_COUPON_ID,
  SUPPORTED_COUNTRIES,
} from 'lib/stripe-constants';
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

function determineMode(input: CheckoutInput): 'payment' | 'subscription' | 'mixed' {
  const subs = input.line_items.filter((li) => li.is_subscription === true);
  if (subs.length === 0) return 'payment';
  if (subs.length === input.line_items.length) return 'subscription';
  return 'mixed';
}

function buildShippingOptions(): NonNullable<SessionCreateParams['shipping_options']> {
  const options: NonNullable<SessionCreateParams['shipping_options']> = [];
  if (SHIPPING_RATE_FREE_ID) options.push({ shipping_rate: SHIPPING_RATE_FREE_ID });
  if (SHIPPING_RATE_FLAT_ID) options.push({ shipping_rate: SHIPPING_RATE_FLAT_ID });
  return options;
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
  if (mode === 'mixed') {
    return Response.json(
      {
        error: 'mixed_cart_unsupported',
        message:
          'Cart contains both one-time and subscription items. Please check out separately.',
      },
      { status: 400 },
    );
  }

  const params: SessionCreateParams = {
    mode,
    line_items: parsed.line_items.map((li) => ({
      price: li.stripe_price_id,
      quantity: li.quantity,
    })),
    automatic_tax: { enabled: true },
    customer_email: parsed.customer_email,
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

  // Stripe rejects shipping_options outside of payment mode. For subscriptions
  // we still collect shipping address (above) but recurring shipping cost is
  // handled at the subscription / invoice level, not the checkout session.
  if (mode === 'payment') {
    params.shipping_options = buildShippingOptions();
  } else if (mode === 'subscription') {
    params.subscription_data = { metadata: parsed.metadata };
    // Apply the 15%-off subscription coupon, but only if every line item is
    // the 25-serving subscription Price. Smaller bags cost more per unit so
    // they never carry the discount; today the 25-sub is the only sub Price
    // anyway, but this gate keeps the rule explicit if more subs ship later.
    // Stripe rejects combining discounts[] with allow_promotion_codes, so
    // honor explicit coupon over the promo-code field on subscription mode.
    const ritual25SubId = RITUAL_PRICE_IDS['25-subscription'];
    const allDiscountable =
      ritual25SubId.length > 0 &&
      parsed.line_items.every((li) => li.stripe_price_id === ritual25SubId);
    if (SUBSCRIPTION_COUPON_ID && allDiscountable) {
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
