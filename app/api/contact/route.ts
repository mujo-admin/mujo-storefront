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
});

/**
 * POST target for <ContactForm />.
 * 1. Subscribes the email to the configured Klaviyo Contact list (with topic
 *    + orderNumber as profile properties).
 * 2. Sends a notification email via Resend to kinga@mujoworld.com.
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

  const listId = process.env.KLAVIYO_LIST_ID_CONTACT_FORM;
  if (listId) {
    try {
      await subscribeToList({
        email: parsed.email,
        listId,
        customSource: "Contact form",
        properties: {
          $first_name: parsed.name,
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
        to: ["kinga@mujoworld.com"],
        replyTo: parsed.email,
        subject: `[Contact] ${parsed.topic} — ${parsed.name}`,
        text: [
          `From: ${parsed.name} <${parsed.email}>`,
          `Topic: ${parsed.topic}`,
          parsed.orderNumber ? `Order: ${parsed.orderNumber}` : null,
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
