import { NextRequest } from "next/server";
import { z } from "zod";
import { sendCapiEvent } from "lib/meta-capi";

export const dynamic = "force-dynamic";

// This endpoint is public (the browser calls it), so it accepts only what the
// browser legitimately sends: the three events lib/analytics.ts mirrors, with
// a fixed set of fields. Purchase and InitiateCheckout are sent to Meta by the
// server itself (Stripe webhook and /api/checkout-session) and are NOT accepted
// here: otherwise anyone could post fake purchases into the pixel and distort
// ad reporting and optimisation.
const MIRRORED_EVENTS = ["ViewContent", "AddToCart", "Lead"] as const;

const customDataSchema = z
  .object({
    value: z.number().min(0).max(2000).optional(),
    currency: z.string().length(3).optional(),
    content_type: z.literal("product").optional(),
    content_ids: z.array(z.string().max(80)).max(30).optional(),
    contents: z
      .array(
        z.object({
          id: z.string().max(80),
          quantity: z.number().int().min(1).max(100),
          item_price: z.number().min(0).max(2000).optional(),
        }),
      )
      .max(30)
      .optional(),
    num_items: z.number().int().min(0).max(1000).optional(),
    method: z.string().max(80).optional(),
    purchase_type: z.string().max(40).optional(),
    item_list_name: z.string().max(80).optional(),
  })
  .optional();

const requestSchema = z.object({
  eventName: z.enum(MIRRORED_EVENTS),
  eventId: z.string().min(1).max(200),
  eventSourceUrl: z.string().url().max(2000).optional(),
  userData: z.object({
    email: z.string().email().optional(),
    fbc: z.string().max(500).optional(),
    fbp: z.string().max(200).optional(),
  }),
  customData: customDataSchema,
});

/**
 * Server endpoint that mirrors a browser Pixel event into the Meta Conversions
 * API with the same `eventId` for deduplication. Called only by track() in
 * lib/analytics.ts.
 */
export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof requestSchema>;
  try {
    parsed = requestSchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      {
        error: "invalid_request",
        details: err instanceof z.ZodError ? err.issues : String(err),
      },
      { status: 400 },
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;

  try {
    await sendCapiEvent({
      eventName: parsed.eventName,
      eventId: parsed.eventId,
      eventSourceUrl: parsed.eventSourceUrl,
      userData: {
        email: parsed.userData.email,
        fbc: parsed.userData.fbc,
        fbp: parsed.userData.fbp,
        clientIpAddress: ip,
        clientUserAgent: userAgent,
      },
      customData: parsed.customData,
    });
  } catch (err) {
    // Tracking must never surface as an error to the shopper's browser.
    console.error("[meta/convert] CAPI send failed", err);
  }

  return Response.json({ ok: true });
}
