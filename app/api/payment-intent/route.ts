// Replaces /api/checkout for the on-site Stripe Elements flow.
//
// Returns a PaymentIntent client_secret the browser uses to mount
// <Elements />. One-time and subscription modes both supported (mixed cart
// rejected — same behavior as legacy /api/checkout).
//
// Phase 4 will pre-resolve customer from session cookie. Phase 2 ships
// guest + email-only.

import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { stripe } from 'lib/stripe';
import { db, customers } from 'db';
import {
  SUBSCRIPTION_COUPON_ID,
  SUPPORTED_COUNTRIES,
} from 'lib/stripe-constants';
import { trackStartedCheckout } from 'lib/klaviyo';
import { sendCapiEvent } from 'lib/meta-capi';
import { randomUUID } from 'node:crypto';

export const dynamic = 'force-dynamic';

const lineItemSchema = z.object({
  stripePriceId: z.string().startsWith('price_'),
  quantity: z.number().int().positive().max(50),
  isSubscription: z.boolean(),
  unitAmountCents: z.number().int().nonnegative(),
});

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().nullable().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postal_code: z.string().min(1),
  country: z.enum([...SUPPORTED_COUNTRIES] as [string, ...string[]]),
});

const requestSchema = z.object({
  items: z.array(lineItemSchema).min(1).max(20),
  customerEmail: z.string().email(),
  shippingAddress: addressSchema,
  /** Tax calculation ID from /api/tax/calculate, if pre-computed. */
  taxCalculationId: z.string().optional(),
  /** Server-trusted source-of-truth for what tax to charge. Required if calc id present. */
  taxCents: z.number().int().nonnegative().optional(),
  shippingCents: z.number().int().nonnegative().default(0),
});

type CheckoutInput = z.infer<typeof requestSchema>;

function determineMode(input: CheckoutInput): 'payment' | 'subscription' | 'mixed' {
  const subs = input.items.filter((li) => li.isSubscription === true);
  if (subs.length === 0) return 'payment';
  if (subs.length === input.items.length) return 'subscription';
  return 'mixed';
}

/**
 * Lazy-create a Stripe Customer + app-DB customers row from email. If the row
 * already exists with a stripeCustomerId, use that. Otherwise: create Stripe
 * Customer, link to existing row by email, or insert a new row.
 */
async function ensureStripeCustomer(email: string): Promise<{
  stripeCustomerId: string;
  customerId: string;
}> {
  const existing = await db
    .select()
    .from(customers)
    .where(eq(customers.email, email))
    .limit(1);

  if (existing[0]?.stripeCustomerId) {
    return {
      stripeCustomerId: existing[0].stripeCustomerId,
      customerId: existing[0].id,
    };
  }

  const stripeCustomer = await stripe.customers.create({
    email,
    metadata: { source: 'on-site-checkout' },
  });

  if (existing[0]) {
    await db
      .update(customers)
      .set({ stripeCustomerId: stripeCustomer.id, updatedAt: new Date() })
      .where(eq(customers.id, existing[0].id));
    return {
      stripeCustomerId: stripeCustomer.id,
      customerId: existing[0].id,
    };
  }

  const inserted = await db
    .insert(customers)
    .values({ email, stripeCustomerId: stripeCustomer.id })
    .returning();
  const row = inserted[0];
  if (!row) throw new Error('Customer insert returned no row');
  return { stripeCustomerId: stripeCustomer.id, customerId: row.id };
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

  let stripeCustomerId: string;
  try {
    ({ stripeCustomerId } = await ensureStripeCustomer(parsed.customerEmail));
  } catch (err) {
    console.error('[payment-intent] ensureStripeCustomer failed', err);
    return Response.json({ error: 'customer_create_failed' }, { status: 502 });
  }

  const subtotal = parsed.items.reduce(
    (s, i) => s + i.unitAmountCents * i.quantity,
    0,
  );

  const eventId = randomUUID();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const userAgent = req.headers.get('user-agent') ?? undefined;

  try {
    if (mode === 'payment') {
      const pi = await stripe.paymentIntents.create({
        amount: subtotal + parsed.shippingCents + (parsed.taxCents ?? 0),
        currency: 'usd',
        customer: stripeCustomerId,
        receipt_email: parsed.customerEmail,
        automatic_payment_methods: { enabled: true },
        shipping: {
          name: parsed.customerEmail, // overwritten by Address Element on confirm
          address: {
            line1: parsed.shippingAddress.line1,
            line2: parsed.shippingAddress.line2 ?? undefined,
            city: parsed.shippingAddress.city,
            state: parsed.shippingAddress.state,
            postal_code: parsed.shippingAddress.postal_code,
            country: parsed.shippingAddress.country,
          },
        },
        metadata: {
          line_items: JSON.stringify(
            parsed.items.map((i) => ({
              price: i.stripePriceId,
              quantity: i.quantity,
            })),
          ),
          tax_calculation_id: parsed.taxCalculationId ?? '',
          shipping_cents: String(parsed.shippingCents),
          mujo_event_id: eventId,
        },
      });

      void trackStartedCheckout({
        email: parsed.customerEmail,
        value: pi.amount,
        currency: 'USD',
        items: parsed.items.map((i) => ({
          name: i.stripePriceId,
          quantity: i.quantity,
          priceId: i.stripePriceId,
          isSubscription: i.isSubscription,
        })),
      }).catch((err) => console.error('[payment-intent] Klaviyo failed', err));

      void sendCapiEvent({
        eventName: 'InitiateCheckout',
        eventId,
        eventSourceUrl: req.headers.get('referer') ?? undefined,
        userData: {
          email: parsed.customerEmail,
          clientIpAddress: ip,
          clientUserAgent: userAgent,
        },
        customData: {
          currency: 'USD',
          value: pi.amount / 100,
          num_items: parsed.items.length,
          content_ids: parsed.items.map((i) => i.stripePriceId),
        },
      }).catch((err) => console.error('[payment-intent] Meta CAPI failed', err));

      return Response.json({
        clientSecret: pi.client_secret,
        paymentIntentId: pi.id,
        mode: 'payment',
        eventId,
      });
    }

    // Subscription mode
    const sub = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: parsed.items.map((i) => ({
        price: i.stripePriceId,
        quantity: i.quantity,
      })),
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      automatic_tax: { enabled: true },
      expand: ['latest_invoice.payment_intent'],
      discounts: SUBSCRIPTION_COUPON_ID
        ? [{ coupon: SUBSCRIPTION_COUPON_ID }]
        : undefined,
      metadata: {
        mujo_event_id: eventId,
      },
    });

    const latestInvoice = sub.latest_invoice;
    if (!latestInvoice || typeof latestInvoice === 'string') {
      console.error('[payment-intent] subscription.latest_invoice missing', {
        subId: sub.id,
      });
      return Response.json({ error: 'subscription_invoice_missing' }, { status: 502 });
    }
    const piRef = (
      latestInvoice as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | string }
    ).payment_intent;
    if (!piRef) {
      console.error('[payment-intent] subscription invoice has no payment_intent', {
        subId: sub.id,
      });
      return Response.json(
        { error: 'subscription_payment_intent_missing' },
        { status: 502 },
      );
    }
    const pi = typeof piRef === 'string'
      ? await stripe.paymentIntents.retrieve(piRef)
      : piRef;

    void trackStartedCheckout({
      email: parsed.customerEmail,
      value: pi.amount,
      currency: 'USD',
      items: parsed.items.map((i) => ({
        name: i.stripePriceId,
        quantity: i.quantity,
        priceId: i.stripePriceId,
        isSubscription: i.isSubscription,
      })),
    }).catch((err) => console.error('[payment-intent] Klaviyo failed', err));

    void sendCapiEvent({
      eventName: 'InitiateCheckout',
      eventId,
      eventSourceUrl: req.headers.get('referer') ?? undefined,
      userData: {
        email: parsed.customerEmail,
        clientIpAddress: ip,
        clientUserAgent: userAgent,
      },
      customData: {
        currency: 'USD',
        value: pi.amount / 100,
        num_items: parsed.items.length,
        content_ids: parsed.items.map((i) => i.stripePriceId),
      },
    }).catch((err) => console.error('[payment-intent] Meta CAPI failed', err));

    return Response.json({
      clientSecret: pi.client_secret,
      paymentIntentId: pi.id,
      subscriptionId: sub.id,
      mode: 'subscription',
      eventId,
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      const code = err.code ?? 'stripe_error';
      const status = err.statusCode ?? 502;
      console.error('[payment-intent] Stripe error', { code, message: err.message });
      return Response.json(
        { error: code, message: err.message },
        { status: status >= 400 && status < 500 ? 400 : 502 },
      );
    }
    console.error('[payment-intent] Unexpected error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
