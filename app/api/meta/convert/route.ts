import { NextRequest } from "next/server";
import { z } from "zod";
import { sendCapiEvent } from "lib/meta-capi";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  eventName: z.string().min(1).max(50),
  eventId: z.string().min(1).max(200),
  eventSourceUrl: z.string().url().optional(),
  userData: z.object({
    email: z.string().email().optional(),
    phone: z.string().optional(),
    fbc: z.string().optional(),
    fbp: z.string().optional(),
  }),
  customData: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Server endpoint that mirrors a client Pixel event into the Meta Conversions
 * API with the same `eventId` for deduplication. Called by client navigations
 * (lib/meta-pixel.ts pair) and by the Stripe webhook handler for `Purchase`.
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

  await sendCapiEvent({
    eventName: parsed.eventName,
    eventId: parsed.eventId,
    eventSourceUrl: parsed.eventSourceUrl,
    userData: {
      email: parsed.userData.email,
      phone: parsed.userData.phone,
      fbc: parsed.userData.fbc,
      fbp: parsed.userData.fbp,
      clientIpAddress: ip,
      clientUserAgent: userAgent,
    },
    customData: parsed.customData,
  });

  return Response.json({ ok: true });
}
