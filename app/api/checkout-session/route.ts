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
  FREE_SHIPPING_THRESHOLD_CENTS,
  SHIPPING_RATE_EXPRESS_ID,
  SHIPPING_RATE_FLAT_ID,
  SHIPPING_RATE_FREE_ID,
  SUPPRESS_EXPRESS_FOR_MERCH,
  SUPPORTED_COUNTRIES,
} from 'lib/stripe-constants';
import { resolveMerchPriceId } from 'lib/cart/merch-config';
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

// Any cart with ≥1 subscription line runs in subscription mode — Stripe bills
// the one-time lines on the first invoice (20 recurring + 20 one-time max).
// Previously a mixed cart was rejected with a 400; now it checks out in one go,
// and (being subscription mode) ships free with no Express option.
function determineMode(input: CheckoutSessionInput): 'payment' | 'subscription' {
  return input.items.some((li) => li.isSubscription === true)
    ? 'subscription'
    : 'payment';
}

// Resolves the shipping options Stripe shows the customer. Free shipping is
// EARNED, never a pickable radio sitting next to a paid Standard: at/above the
// threshold the ONLY base rate is Free; below it, the ONLY base rate is the $5
// Standard. Express is an optional paid upgrade layered on top — suppressed on
// merch (POD express is slow/costly) and only when the rate has been minted.
// Payment mode only; subscription/mixed carts pass no shipping_options (Stripe
// rejects them in subscription mode → free shipping by construction).
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

// Authoritative merchandise subtotal — fetched from Stripe Prices, never
// trusted from the client (a spoofed cart can't unlock free shipping). Used
// only in payment mode, where every line item is a one-time Price.
async function computeSubtotalCents(
  items: { stripePriceId: string; quantity: number }[],
): Promise<number> {
  const prices = await Promise.all(
    items.map((i) => stripe.prices.retrieve(i.stripePriceId)),
  );
  return prices.reduce(
    (sum, price, idx) => sum + (price.unit_amount ?? 0) * (items[idx]?.quantity ?? 0),
    0,
  );
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
    // Per-session branding overrides Stripe Dashboard defaults. Cream surface
    // (matches tokens.css --cream): with ONE background knob, pure white made the
    // payment field-cards lose contrast and the white "leaked" across the column;
    // cream keeps them as crisp rounded white cards. The trade-off — Stripe paints
    // its order-summary panel in this same color, so the summary reads cream, not
    // white. A true white rounded summary card needs the deferred Custom-UI
    // (Elements) rebuild: plans/2026-06-10-checkout-elements-custom-ui-rebuild.md.
    // Orange matches --orange (Pay button + accents); border-style rounded matches
    // our 10-14px brand radius; font_family 'inter' is the closest clean grotesque
    // sans in Stripe's supported list to Mujo's body font (Hanken Grotesk).
    branding_settings: {
      background_color: '#F3F2E9',
      button_color: '#F2682F',
      border_style: 'rounded',
      font_family: 'inter',
    },
    custom_text: {
      shipping_address: {
        message:
          'Free US shipping on orders over $100 (and on every subscription). Ships from our US fulfilment partners.',
      },
      submit: {
        message: '30-day money-back guarantee. Cancel or change your subscription after two billing cycles.',
      },
    },
    metadata: { mujo_event_id: eventId },
  };

  // INTENTIONAL subscriber free-shipping perk: subscription mode deliberately
  // gets NO shipping_options, so every subscription order (initial + renewals)
  // ships free regardless of value. Do not add subscription shipping here.
  // One-time orders keep the $100 free-ship threshold via buildShippingOptions().
  if (mode === 'payment') {
    // Compute the authoritative subtotal to gate free shipping ($100+, pre-
    // discount). On any failure, default to 0 → the paid Standard rate, so an
    // unverifiable cart never gives away free shipping.
    let subtotalCents = 0;
    try {
      subtotalCents = await computeSubtotalCents(parsed.items);
    } catch (err) {
      console.error(
        '[checkout-session] subtotal computation failed; defaulting to paid shipping',
        err,
      );
    }
    const hasMerch = parsed.items.some(
      (i) => resolveMerchPriceId(i.stripePriceId) !== null,
    );
    params.shipping_options = buildShippingOptions(subtotalCents, hasMerch);
    // allow_promotion_codes lets customers type a code at checkout — this is the
    // path the first-buyer WELCOME10 code (coupon MUJO_FIRST_10, 10% off once,
    // first_time_transaction only) rides on, plus any partner / press codes.
    params.allow_promotion_codes = true;
  } else if (mode === 'subscription') {
    params.subscription_data = { metadata: { mujo_event_id: eventId } };
    // The 15% subscriber discount is BAKED INTO the subscription Price (mirrored
    // at $55.25, not $65 + coupon — see scripts/mirror-shopify-to-stripe.ts). We
    // apply NO coupon here, which leaves Stripe Checkout's single discount slot
    // free: the promo box stays open so a subscribing shopper can still redeem a
    // first-purchase / marketing code (e.g. WELCOME10). MUJO_SUB_15 lives on only
    // for existing/migrated subscribers on legacy full-retail Prices.
    //
    // MIXED CARTS (sub + one-time merch in one checkout) need no coupon scoping:
    // with no coupon applied at all, the merch line is simply charged at full
    // price and only the Ritual line carries its baked-in 15%. The old
    // Ritual-scoped twin coupon (SUBSCRIPTION_COUPON_RITUAL_ID) is therefore
    // obsolete for new checkouts.
    params.allow_promotion_codes = true;
  }

  // Stripe rejects passing both `customer` and `customer_email` on the same
  // session — `customer` wins when available because it unlocks saved cards.
  //
  // For guests (no signed-in stripeCustomerId) we still try to REUSE an
  // existing Stripe Customer matched by email, rather than letting Stripe spin
  // up a brand-new Customer on every attempt. This is dedup layer 1 (the May
  // 2026 double-bill root cause: 3 pay attempts → 3 Customers → 3 subs). Layer
  // 2 — the duplicate-subscription guard in the customer.subscription.created
  // webhook — needs all attempts on ONE Customer to recognize them as dupes.
  let resolvedCustomerId = customerId;
  if (!resolvedCustomerId && customerEmail) {
    try {
      const existing = await stripe.customers.list({
        email: customerEmail,
        limit: 1,
      });
      resolvedCustomerId = existing.data[0]?.id ?? null;
    } catch (err) {
      // Non-fatal: fall back to customer_email below. Never block checkout on a
      // lookup hiccup.
      console.error('[checkout-session] customer lookup failed', err);
    }
  }

  if (resolvedCustomerId) {
    params.customer = resolvedCustomerId;
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
