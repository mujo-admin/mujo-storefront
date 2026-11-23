import { NextRequest } from "next/server";
import { z } from "zod";
import { trackEvent } from "lib/klaviyo";
import { stripe } from "lib/stripe";

export const dynamic = "force-dynamic";

// The one event the browser reports through this endpoint: the order
// confirmation page was seen (app/checkout/success/success-client.tsx).
// Everything else reaches Klaviyo from the browser SDK or the Stripe webhook.
const requestSchema = z.object({
  email: z.string().email(),
  metric: z.literal("Order Confirmation Viewed"),
  properties: z.object({
    CheckoutSessionId: z.string().regex(/^cs_[A-Za-z0-9_]{10,200}$/),
    Value: z.number().min(0).max(100000).optional(),
    Currency: z.string().max(8).optional(),
  }),
});

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      { error: "invalid_request", details: err instanceof z.ZodError ? err.issues : String(err) },
      { status: 400 },
    );
  }

  // This endpoint is public. Before writing an event onto someone's Klaviyo
  // profile, check with Stripe that this checkout really was completed by that
  // email, and take the amount from Stripe rather than from the request.
  try {
    const session = await stripe.checkout.sessions.retrieve(
      parsed.properties.CheckoutSessionId,
    );
    const sessionEmail = (
      session.customer_details?.email ??
      session.customer_email ??
      ""
    ).toLowerCase();
    if (session.status !== "complete" || sessionEmail !== parsed.email.toLowerCase()) {
      // Same answer as success: nothing to learn from probing.
      return Response.json({ ok: true });
    }

    await trackEvent({
      email: parsed.email,
      metric: parsed.metric,
      properties: {
        CheckoutSessionId: session.id,
        Value: (session.amount_total ?? 0) / 100,
        Currency: (session.currency ?? "usd").toUpperCase(),
      },
      uniqueId: `confirmation-viewed-${session.id}`,
    });
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[klaviyo/track] failed", err);
    return Response.json({ ok: true });
  }
}
