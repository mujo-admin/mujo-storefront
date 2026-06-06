import { NextRequest } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { subscribeToList } from "lib/klaviyo";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  // Honeypot — real people leave this blank; bots tend to fill every field.
  website: z.string().max(200).optional(),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  country: z.string().min(1).max(80),
  platform: z.string().min(1).max(60),
  profileLink: z.string().min(1).max(300),
  otherLinks: z.string().max(400).optional(),
  whoYouAre: z.string().min(1).max(80),
  audience: z.string().min(1).max(300),
  audienceSize: z.string().min(1).max(40),
  engagement: z.string().max(120).optional(),
  usesMujo: z.string().min(1).max(60),
  why: z.string().min(1).max(2000),
  extra: z.string().max(2000).optional(),
});

/**
 * POST target for <AmbassadorForm /> (the /ambassador apply section).
 * 1. Subscribes the applicant to the Klaviyo master list with
 *    `ambassador_applicant: true` + every answer as a profile property, so
 *    the segment is ready for an approval / welcome-kit flow.
 * 2. Sends the full application to kinga@mujoworld.com via Resend, reply-to
 *    set to the applicant so Kinga can reply in one tap.
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

  // Honeypot tripped — silently accept (return ok so the bot sees success)
  // but do nothing. Never email or subscribe.
  if (parsed.website && parsed.website.trim()) {
    return Response.json({ ok: true });
  }

  // Single-master-list pattern: ambassador applications go to the master
  // newsletter list, tagged `ambassador_applicant` for segmentation.
  const listId =
    process.env.KLAVIYO_NEWSLETTER_LIST_ID?.trim() ||
    process.env.KLAVIYO_LEMNA_LIST_ID?.trim();
  if (listId) {
    try {
      await subscribeToList({
        email: parsed.email,
        listId,
        customSource: "Ambassador application",
        properties: {
          $first_name: parsed.name,
          ambassador_applicant: true,
          source: "Ambassador application",
          AmbassadorCountry: parsed.country,
          AmbassadorPlatform: parsed.platform,
          AmbassadorProfileLink: parsed.profileLink,
          AmbassadorOtherLinks: parsed.otherLinks ?? null,
          AmbassadorWhoYouAre: parsed.whoYouAre,
          AmbassadorAudience: parsed.audience.slice(0, 300),
          AmbassadorAudienceSize: parsed.audienceSize,
          AmbassadorEngagement: parsed.engagement ?? null,
          AmbassadorUsesMujo: parsed.usesMujo,
          AmbassadorWhy: parsed.why.slice(0, 500),
          AmbassadorExtra: parsed.extra ? parsed.extra.slice(0, 500) : null,
        },
      });
    } catch (err) {
      console.error("[ambassador] Klaviyo subscribe failed", err);
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "Mujo Ambassador Applications <hello@mujoworld.com>",
        to: ["kinga@mujoworld.com"],
        replyTo: parsed.email,
        subject: `[Ambassador] ${parsed.name} — ${parsed.whoYouAre}`,
        text: [
          `Name:           ${parsed.name}`,
          `Email:          ${parsed.email}`,
          `Country:        ${parsed.country}`,
          `Platform:       ${parsed.platform}`,
          `Profile link:   ${parsed.profileLink}`,
          parsed.otherLinks ? `Other links:    ${parsed.otherLinks}` : null,
          `Who they are:   ${parsed.whoYouAre}`,
          `Audience:       ${parsed.audience}`,
          `Audience size:  ${parsed.audienceSize}`,
          parsed.engagement ? `Engagement:     ${parsed.engagement}` : null,
          `Uses Mujo:      ${parsed.usesMujo}`,
          "",
          "Why Mujo / what they'd share:",
          parsed.why,
          parsed.extra ? "" : null,
          parsed.extra ? "Anything else:" : null,
          parsed.extra ?? null,
        ]
          .filter((line) => line !== null)
          .join("\n"),
      });
    } catch (err) {
      console.error("[ambassador] Resend send failed", err);
    }
  }

  return Response.json({ ok: true });
}
