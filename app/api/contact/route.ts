import { NextRequest } from "next/server";
import { z } from "zod";
import { Resend } from "resend";
import { subscribeToList } from "lib/klaviyo";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  topic: z.string().min(1).max(80),
  orderNumber: z.string().max(80).optional(),
  message: z.string().min(1).max(5000),
  // Ticked "send me Mujo news" box. Without it the sender is NOT added to the
  // email list: writing in with a question is not a sign-up.
  marketingConsent: z.boolean().optional(),
  // Honeypot: hidden from people, so only a bot fills it in.
  company: z.string().max(200).optional(),
});

/** Email subjects are one line: drop any line breaks a sender slipped in. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/**
 * POST target for <ContactForm />.
 * 1. Subscribes the email to the configured Klaviyo Contact list (with topic
 *    + orderNumber as profile properties).
 * 2. Sends a notification email via Resend to hello@mujoworld.com.
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

  // Honeypot tripped: answer as if it worked, but send and subscribe nothing.
  if (parsed.company && parsed.company.trim()) {
    return Response.json({ ok: true });
  }

  // Only with the tick box: add the sender to the master newsletter list with
  // `contact_form_submitted: true` for segmentation.
  const listId =
    process.env.KLAVIYO_NEWSLETTER_LIST_ID?.trim() ||
    process.env.KLAVIYO_LEMNA_LIST_ID?.trim();
  if (listId && parsed.marketingConsent === true) {
    try {
      await subscribeToList({
        email: parsed.email,
        listId,
        customSource: "Contact form",
        properties: {
          $first_name: parsed.name,
          contact_form_submitted: true,
          source: "Contact form",
          ContactTopic: parsed.topic,
          ContactOrderNumber: parsed.orderNumber ?? null,
          ContactMessageExcerpt: parsed.message.slice(0, 240),
        },
      });
    } catch (err) {
      console.error("[contact] Klaviyo subscribe failed", err);
    }
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "Mujo Contact Form <hello@mujoworld.com>",
        to: ["hello@mujoworld.com"],
        replyTo: parsed.email,
        subject: oneLine(`[Contact] ${parsed.topic} — ${parsed.name}`),
        text: [
          `From: ${parsed.name} <${parsed.email}>`,
          `Topic: ${parsed.topic}`,
          parsed.orderNumber ? `Order: ${parsed.orderNumber}` : null,
          `Wants Mujo emails: ${parsed.marketingConsent === true ? "yes" : "no"}`,
          "",
          parsed.message,
        ]
          .filter(Boolean)
          .join("\n"),
      });
    } catch (err) {
      console.error("[contact] Resend send failed", err);
    }
  }

  return Response.json({ ok: true });
}
