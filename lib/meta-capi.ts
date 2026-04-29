/**
 * Meta Conversions API — server-side mirror for Pixel events.
 * Pair each call with a matching `eventId` on the client (lib/meta-pixel.ts)
 * so Meta's deduplication keeps post-iOS-14 attribution at ~95%+.
 *
 * Env:
 *   NEXT_PUBLIC_META_PIXEL_ID  (Pixel ID, used here for the API URL)
 *   META_CAPI_TOKEN            (Conversions API access token, server only)
 *   META_CAPI_TEST_EVENT_CODE  (Test Events code; remove from prod env post-cutover)
 */

import { createHash } from "node:crypto";

const GRAPH_API_VERSION = "v22.0";

function pixelId(): string | null {
  return process.env.NEXT_PUBLIC_META_PIXEL_ID?.trim() || null;
}
function capiToken(): string | null {
  return process.env.META_CAPI_TOKEN?.trim() || null;
}

function sha256(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export type CapiEvent = {
  eventName: string;
  eventId: string;
  eventTime?: number;
  eventSourceUrl?: string;
  userData: {
    email?: string;
    phone?: string;
    clientIpAddress?: string;
    clientUserAgent?: string;
    /** Facebook click ID (`fbc`) cookie value, if available. */
    fbc?: string;
    /** Facebook browser ID (`fbp`) cookie value, if available. */
    fbp?: string;
  };
  customData?: Record<string, unknown>;
};

export async function sendCapiEvent(event: CapiEvent): Promise<void> {
  const id = pixelId();
  const token = capiToken();
  if (!id || !token) return; // Silently no-op if not configured.

  const body = {
    data: [
      {
        event_name: event.eventName,
        event_time: event.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        event_source_url: event.eventSourceUrl,
        action_source: "website",
        user_data: {
          em: sha256(event.userData.email),
          ph: sha256(event.userData.phone),
          client_ip_address: event.userData.clientIpAddress,
          client_user_agent: event.userData.clientUserAgent,
          fbc: event.userData.fbc,
          fbp: event.userData.fbp,
        },
        custom_data: event.customData,
      },
    ],
    test_event_code: process.env.META_CAPI_TEST_EVENT_CODE || undefined,
  };

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${id}/events?access_token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[meta-capi] event failed", res.status, text);
  }
}
