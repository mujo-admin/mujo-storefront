import { NextRequest } from "next/server";
import { z } from "zod";
import { subscribeToList } from "lib/klaviyo";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  email: z.string().email(),
  /** Logical source — routed to a single master list with profile properties. */
  list: z
    .enum([
      "lemna_waitlist",
      "ambassador_applications",
      "contact_form",
      "journal_newsletter",
    ])
    .optional(),
  source: z.string().max(80).optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

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
  lemna_waitlist: { lemna_early_access: true, source: "Lemna waitlist" },
  ambassador_applications: { ambassador_applicant: true, source: "Ambassador" },
  contact_form: { contact_form_submitted: true, source: "Contact form" },
  journal_newsletter: { journal_subscriber: true, source: "Journal" },
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
  const merged = {
    ...baseProperties,
    ...((parsed.properties as Record<string, unknown>) ?? {}),
  };

  const sourceLabel =
    parsed.source ??
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
