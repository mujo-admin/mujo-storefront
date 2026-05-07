import { NextRequest } from "next/server";
import { z } from "zod";
import { trackEvent } from "lib/klaviyo";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  email: z.string().email(),
  metric: z.string().min(1).max(120),
  properties: z.record(z.string(), z.unknown()).optional(),
  value: z.number().optional(),
  uniqueId: z.string().optional(),
});

const ALLOWED_METRICS = new Set([
  "Order Confirmation Viewed",
  "Cart Updated",
]);

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

  // Allow-list to prevent the public endpoint becoming a generic Klaviyo
  // event-spammer. Only metrics fired from documented callsites pass.
  if (!ALLOWED_METRICS.has(parsed.metric)) {
    return Response.json({ error: "metric_not_allowed" }, { status: 400 });
  }

  try {
    await trackEvent(parsed);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[klaviyo/track] failed", err);
    return Response.json({ error: "track_failed" }, { status: 502 });
  }
}
