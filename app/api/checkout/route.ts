import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { stripe } from 'lib/stripe';
import {
  SHIPPING_RATE_FLAT_ID,
  SHIPPING_RATE_FREE_ID,
  SUPPORTED_COUNTRIES,
} from 'lib/stripe-constants';

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
    allow_promotion_codes: true,
  };

  // Stripe rejects shipping_options outside of payment mode. For subscriptions
  // we still collect shipping address (above) but recurring shipping cost is
  // handled at the subscription / invoice level, not the checkout session.
  if (mode === 'payment') {
    params.shipping_options = buildShippingOptions();
  } else if (mode === 'subscription') {
    params.subscription_data = { metadata: parsed.metadata };
  }

  try {
    const session = await stripe.checkout.sessions.create(params);
    if (!session.url) {
      return Response.json({ error: 'stripe_no_url' }, { status: 502 });
    }
    return Response.json({ url: session.url, session_id: session.id });
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
