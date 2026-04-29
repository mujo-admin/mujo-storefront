import { NextRequest } from "next/server";
import { z } from "zod";
import { subscribeToList } from "lib/klaviyo";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  email: z.string().email(),
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

const LIST_ID_BY_NAME: Record<string, string | undefined> = {
  lemna_waitlist: process.env.KLAVIYO_LIST_ID_LEMNA_WAITLIST,
  ambassador_applications: process.env.KLAVIYO_LIST_ID_AMBASSADOR_APPLICATIONS,
  contact_form: process.env.KLAVIYO_LIST_ID_CONTACT_FORM,
  journal_newsletter: process.env.KLAVIYO_LIST_ID_JOURNAL_NEWSLETTER,
};

/**
 * Public Klaviyo subscribe endpoint for non-Klaviyo-embed waitlist forms
 * (Lemna trio, ambassador, journal newsletter footer).
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

  const listId = LIST_ID_BY_NAME[parsed.list ?? "lemna_waitlist"];
  if (!listId) {
    // Anti-enumeration: never reveal "list not configured" to the client.
    console.warn("[klaviyo/subscribe] list not configured", parsed.list);
    return Response.json({ ok: true });
  }

  try {
    await subscribeToList({
      email: parsed.email,
      listId,
      customSource: parsed.source ?? "Mujo Website",
      properties: (parsed.properties as Record<string, unknown>) ?? {},
    });
  } catch (err) {
    console.error("[klaviyo/subscribe] failed", err);
  }

  return Response.json({ ok: true });
}
