// Creates a Stripe Checkout Session with ui_mode='embedded' for the on-site
// checkout iframe. Returns client_secret which the browser passes to
// <EmbeddedCheckoutProvider>. The customer never leaves mujoworld.com — Stripe
// renders the form inside an iframe pinned to /checkout.
//
// Replaces the Phase 2 /api/payment-intent path (Stripe Elements). W2's legacy
// /api/checkout (mode='hosted', returns url) stays alive as the 30-day stale-tab
// compat shim.

import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { stripe } from 'lib/stripe';
import {
  SHIPPING_RATE_FLAT_ID,
  SHIPPING_RATE_FREE_ID,
  SUBSCRIPTION_COUPON_ID,
  SUPPORTED_COUNTRIES,
} from 'lib/stripe-constants';
import { trackStartedCheckout } from 'lib/klaviyo';
import { sendCapiEvent } from 'lib/meta-capi';
import { getSession } from 'lib/session';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

type SessionCreateParams = NonNullable<
  Parameters<typeof stripe.checkout.sessions.create>[0]
>;

const cartLineItemSchema = z.object({
  stripePriceId: z.string().startsWith('price_'),
  quantity: z.number().int().positive().max(50),
  isSubscription: z.boolean(),
});

const requestSchema = z.object({
  items: z.array(cartLineItemSchema).min(1).max(20),
  /** Optional pre-fill (Phase 4 will pass it from session). */
  customerEmail: z.string().email().optional(),
  /** Origin URL for return_url construction (server can read host header but client knows the canonical origin). */
  origin: z.string().url(),
});

type CheckoutSessionInput = z.infer<typeof requestSchema>;

function determineMode(input: CheckoutSessionInput): 'payment' | 'subscription' | 'mixed' {
  const subs = input.items.filter((li) => li.isSubscription === true);
  if (subs.length === 0) return 'payment';
  if (subs.length === input.items.length) return 'subscription';
  return 'mixed';
}

function buildShippingOptions(): NonNullable<SessionCreateParams['shipping_options']> {
  const options: NonNullable<SessionCreateParams['shipping_options']> = [];
  if (SHIPPING_RATE_FREE_ID) options.push({ shipping_rate: SHIPPING_RATE_FREE_ID });
  if (SHIPPING_RATE_FLAT_ID) options.push({ shipping_rate: SHIPPING_RATE_FLAT_ID });
  return options;
}

export async function POST(req: NextRequest) {
  let parsed: CheckoutSessionInput;
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

  const eventId = randomUUID();
  const returnUrl = `${parsed.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}&event_id=${eventId}`;

  // Phase 4 pre-fill: if the customer is signed in, hand Stripe the saved
  // Stripe customer ID. Embedded Checkout will then surface the customer's
  // saved cards (off-session payment methods) automatically and pre-fill the
  // billing address from prior sessions. Falls back to customer_email so a
  // session-less request from the same browser still gets email pre-fill.
  const session = await getSession();
  const customerId = session?.stripeCustomerId ?? null;
  const customerEmail =
    parsed.customerEmail ?? session?.email ?? undefined;

  const params: SessionCreateParams = {
    // Dahlia API renamed: 'embedded' → 'embedded_page', 'hosted' → 'hosted_page'.
    // The Stripe.js client (loadStripe + <EmbeddedCheckoutProvider>) reads
    // session.client_secret regardless of the ui_mode label.
    ui_mode: 'embedded_page',
    return_url: returnUrl,
    mode,
    line_items: parsed.items.map((li) => ({
      price: li.stripePriceId,
      quantity: li.quantity,
    })),
    automatic_tax: { enabled: true },
    shipping_address_collection: {
      allowed_countries: [...SUPPORTED_COUNTRIES],
    },
    // Per-session branding overrides Stripe Dashboard defaults. Cream matches
    // tokens.css --cream so the iframe blends with the page background; orange
    // matches --orange so the Pay button + accents read as Mujo. Border-style
    // rounded matches our 10-14px brand radius.
    branding_settings: {
      background_color: '#F3F2E9',
      button_color: '#F2682F',
      border_style: 'rounded',
    },
    metadata: { mujo_event_id: eventId },
  };

  if (mode === 'payment') {
    params.shipping_options = buildShippingOptions();
    // allow_promotion_codes lets customers type a code at checkout — this is the
    // path the first-buyer WELCOME10 code (coupon MUJO_FIRST_10, 10% off once,
    // first_time_transaction only) rides on, plus any partner / press codes.
    params.allow_promotion_codes = true;
  } else if (mode === 'subscription') {
    params.subscription_data = { metadata: { mujo_event_id: eventId } };
    // Apply MUJO_SUB_15 (15% off, forever) to all subscription checkouts.
    // Stripe rejects combining discounts[] with allow_promotion_codes, so we
    // honor the explicit 15% coupon over the promo-code field here. (No promo
    // box on subscriptions by design — the auto-applied 15% beats WELCOME10's
    // 10%-once, and a first-time subscriber gets the better deal automatically.)
    if (SUBSCRIPTION_COUPON_ID) {
      params.discounts = [{ coupon: SUBSCRIPTION_COUPON_ID }];
    }
  }

  // Stripe rejects passing both `customer` and `customer_email` on the same
  // session — `customer` wins when available because it unlocks saved cards.
  if (customerId) {
    params.customer = customerId;
    // Required by Stripe whenever an existing customer is passed alongside
    // automatic_tax + shipping_address_collection: the session must declare
    // it can write the collected address back to the Customer record (Stripe
    // needs this to compute tax against the customer's persistent location).
    // Applies to both payment and subscription modes — Stripe enforces it
    // identically.
    params.customer_update = { address: 'auto', name: 'auto', shipping: 'auto' };
  } else {
    if (customerEmail) {
      params.customer_email = customerEmail;
    }
    // Force Stripe to create a Customer for guest one-time checkouts.
    // Without this, mode='payment' sessions complete with `customer: null`,
    // the checkout-completed webhook handler can't link the order, and no
    // order_mirror / Shopify order is created (customer charged, nothing
    // ships). Stripe rejects `customer_creation` on subscription mode (it
    // always creates a Customer for subs anyway), so this is gated to
    // payment mode only.
    if (mode === 'payment') {
      params.customer_creation = 'always';
    }
  }

  try {
    const session = await stripe.checkout.sessions.create(params);
    if (!session.client_secret) {
      console.error('[checkout-session] Stripe returned no client_secret', {
        sessionId: session.id,
      });
      return Response.json({ error: 'stripe_no_client_secret' }, { status: 502 });
    }

    // Fire-and-forget analytics — never block Stripe response.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const userAgent = req.headers.get('user-agent') ?? undefined;
    const totalQuantity = parsed.items.reduce((s, li) => s + li.quantity, 0);

    if (customerEmail) {
      void trackStartedCheckout({
        email: customerEmail,
        value: totalQuantity,
        currency: 'USD',
        items: parsed.items.map((li) => ({
          name: li.stripePriceId,
          quantity: li.quantity,
          priceId: li.stripePriceId,
          isSubscription: li.isSubscription,
        })),
      }).catch((err) => console.error('[checkout-session] Klaviyo failed', err));
    }

    void sendCapiEvent({
      eventName: 'InitiateCheckout',
      eventId,
      eventSourceUrl: req.headers.get('referer') ?? undefined,
      userData: {
        email: customerEmail,
        clientIpAddress: ip,
        clientUserAgent: userAgent,
      },
      customData: {
        currency: 'USD',
        num_items: parsed.items.length,
        content_ids: parsed.items.map((li) => li.stripePriceId),
      },
    }).catch((err) => console.error('[checkout-session] Meta CAPI failed', err));

    return Response.json({
      clientSecret: session.client_secret,
      sessionId: session.id,
      eventId,
      mode,
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      const code = err.code ?? 'stripe_error';
      const status = err.statusCode ?? 502;
      console.error('[checkout-session] Stripe error', { code, message: err.message });
      return Response.json(
        { error: code, message: err.message },
        { status: status >= 400 && status < 500 ? 400 : 502 },
      );
    }
    console.error('[checkout-session] Unexpected error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
