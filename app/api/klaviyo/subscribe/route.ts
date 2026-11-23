import { NextRequest } from "next/server";
import { z } from "zod";
import { subscribeToList } from "lib/klaviyo";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  email: z.string().email(),
  /** Logical source — routed to a single master list with profile properties. */
  // Only the lists a signup form on the site actually uses (SIGNUP_FORMS in
  // components/imported-page-runtime.tsx). Ambassador applications have their
  // own route; the quiz was removed.
  list: z.enum(["lemna_waitlist", "rebel_club"]).optional(),
  source: z.string().max(80).optional(),
  // The one property a signup form sends. Anything else in the request is
  // dropped: this endpoint is public, and free-form properties let anyone
  // overwrite fields on any customer's Klaviyo profile.
  properties: z.object({ mujo_tribe: z.string().trim().max(60).optional() }).optional(),
});

// Source labels the site's own forms send. An unknown label falls back to the
// list's default, so the public endpoint cannot write arbitrary text.
const KNOWN_SOURCES = new Set([
  "Rebel Club signup",
  "Lemna waitlist",
  "Protein powder page",
]);

/**
 * Single-master-list pattern:
 *   - All signups go to KLAVIYO_NEWSLETTER_LIST_ID (defaulting to KLAVIYO_LEMNA_LIST_ID
 *     since they're often the same master list).
 *   - Source is captured via Klaviyo profile properties so segmentation in flows
 *     still works (e.g. lemna_early_access=true, ambassador_applicant=true).
 */
const MASTER_LIST_ID = (): string | undefined =>
  process.env.KLAVIYO_NEWSLETTER_LIST_ID?.trim() ||
  process.env.KLAVIYO_LEMNA_LIST_ID?.trim();

const PROPERTIES_BY_SOURCE: Record<string, Record<string, unknown>> = {
  lemna_waitlist: {
    mujo_protein_waitlist: true,
    signup_source: "lemna_landing",
    source: "Lemna waitlist",
  },
  rebel_club: {
    rebel_club_member: true,
    signup_source: "rebel_club",
    source: "Rebel Club",
  },
};

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

  const listId = MASTER_LIST_ID();
  if (!listId) {
    console.warn("[klaviyo/subscribe] KLAVIYO_NEWSLETTER_LIST_ID not configured");
    return Response.json({ ok: true }); // anti-enumeration: same response shape
  }

  const sourceKey = parsed.list ?? "lemna_waitlist";
  const baseProperties = PROPERTIES_BY_SOURCE[sourceKey] ?? {};
  const merged: Record<string, unknown> = {
    ...baseProperties,
    ...(parsed.properties?.mujo_tribe
      ? { mujo_tribe: parsed.properties.mujo_tribe }
      : {}),
  };

  const sourceLabel =
    (parsed.source && KNOWN_SOURCES.has(parsed.source) ? parsed.source : undefined) ??
    (typeof baseProperties.source === "string"
      ? baseProperties.source
      : undefined) ??
    "Mujo Website";

  try {
    await subscribeToList({
      email: parsed.email,
      listId,
      customSource: sourceLabel,
      properties: merged,
    });
  } catch (err) {
    console.error("[klaviyo/subscribe] failed", err);
  }

  return Response.json({ ok: true });
}
