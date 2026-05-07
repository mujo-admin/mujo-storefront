import { NextRequest } from 'next/server';
import { z } from 'zod';
import Stripe from 'stripe';
import { calculateTax } from 'lib/stripe-tax';
import { shippingCents as computeShippingCents } from 'lib/cart/pricing';

export const dynamic = 'force-dynamic';

const lineItemSchema = z.object({
  stripePriceId: z.string().startsWith('price_'),
  productHandle: z.string(),
  productTitle: z.string(),
  variantTitle: z.string(),
  image: z.object({ url: z.string(), alt: z.string() }),
  unitAmountCents: z.number().int().nonnegative(),
  currency: z.literal('usd'),
  isSubscription: z.boolean(),
  quantity: z.number().int().positive().max(50),
});

const addressSchema = z.object({
  line1: z.string().min(1),
  line2: z.string().nullable().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postal_code: z.string().min(1),
  country: z.string().length(2),
});

const requestSchema = z.object({
  items: z.array(lineItemSchema).min(1).max(20),
  shippingAddress: addressSchema,
});

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof requestSchema>;
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

  const subtotal = parsed.items.reduce(
    (s, i) => s + i.unitAmountCents * i.quantity,
    0,
  );
  const shipping = computeShippingCents(subtotal);

  try {
    const result = await calculateTax({
      items: parsed.items,
      shippingAddress: parsed.shippingAddress,
      shippingCents: shipping,
    });
    return Response.json({
      taxCents: result.taxCents,
      calculationId: result.calculationId,
      shippingCents: shipping,
      subtotalCents: subtotal,
      totalCents: result.totals.totalCents,
    });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) {
      console.error('[tax/calculate] Stripe error', {
        code: err.code,
        message: err.message,
      });
      return Response.json(
        { error: err.code ?? 'stripe_error', message: err.message },
        { status: 502 },
      );
    }
    console.error('[tax/calculate] Unexpected error', err);
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
