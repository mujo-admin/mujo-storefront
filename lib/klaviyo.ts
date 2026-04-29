/**
 * Klaviyo helpers — server-side track + subscribe + identify.
 * Public key is loaded as a <Script> on the client (klaviyo.js auto-hydrates
 * inline form embeds matching `.klaviyo-form-{id}`); private key drives the
 * server API calls below.
 *
 * Env vars expected:
 *   NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY  (6-char alphanumeric, exposed to client)
 *   KLAVIYO_PRIVATE_API_KEY         (full read/write scope, server only)
 *   KLAVIYO_NEWSLETTER_LIST_ID      (single master list — different sources tagged via profile properties)
 *   KLAVIYO_LEMNA_LIST_ID           (alias of master list — Lemna signups land here w/ `lemna_early_access: true`)
 */

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
const KLAVIYO_REVISION = "2024-10-15";

function privateKey(): string | null {
  return (
    process.env.KLAVIYO_PRIVATE_API_KEY?.trim() ||
    process.env.KLAVIYO_PRIVATE_KEY?.trim() ||
    null
  );
}

function authHeaders(): Record<string, string> {
  const key = privateKey();
  if (!key) {
    throw new Error("KLAVIYO_PRIVATE_KEY is not configured");
  }
  return {
    Authorization: `Klaviyo-API-Key ${key}`,
    "Content-Type": "application/json",
    accept: "application/json",
    revision: KLAVIYO_REVISION,
  };
}

export type TrackEventPayload = {
  email: string;
  metric: string;
  properties?: Record<string, unknown>;
  value?: number;
  uniqueId?: string;
};

export async function trackEvent(payload: TrackEventPayload): Promise<void> {
  if (!privateKey()) return; // Silently no-op if not configured (dev/staging).
  const body = {
    data: {
      type: "event",
      attributes: {
        properties: payload.properties ?? {},
        time: new Date().toISOString(),
        value: payload.value,
        unique_id: payload.uniqueId,
        metric: { data: { type: "metric", attributes: { name: payload.metric } } },
        profile: { data: { type: "profile", attributes: { email: payload.email } } },
      },
    },
  };

  const res = await fetch(`${KLAVIYO_API_BASE}/events`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[klaviyo] trackEvent failed", res.status, text);
  }
}

export async function trackStartedCheckout(args: {
  email: string;
  value: number;
  currency: string;
  items: Array<{
    name: string;
    quantity: number;
    priceId: string;
    isSubscription?: boolean;
  }>;
}): Promise<void> {
  await trackEvent({
    email: args.email,
    metric: "Started Checkout",
    value: args.value,
    properties: {
      Currency: args.currency,
      Items: args.items,
      $value: args.value,
    },
    uniqueId: `${args.email}-${Date.now()}`,
  });
}

export async function trackOrderPlaced(args: {
  email: string;
  orderId: string;
  value: number;
  currency: string;
  items: Array<{ name: string; quantity: number; priceId: string }>;
}): Promise<void> {
  await trackEvent({
    email: args.email,
    metric: "Order Placed",
    value: args.value,
    properties: {
      OrderId: args.orderId,
      Currency: args.currency,
      Items: args.items,
      $value: args.value,
      $event_id: args.orderId,
    },
    uniqueId: args.orderId,
  });
}

export async function subscribeToList(args: {
  email: string;
  listId: string;
  customSource?: string;
  properties?: Record<string, unknown>;
}): Promise<void> {
  if (!privateKey()) return;
  const body = {
    data: {
      type: "profile-subscription-bulk-create-job",
      attributes: {
        custom_source: args.customSource ?? "Mujo Website",
        profiles: {
          data: [
            {
              type: "profile",
              attributes: {
                email: args.email,
                properties: args.properties ?? {},
                subscriptions: {
                  email: { marketing: { consent: "SUBSCRIBED" } },
                },
              },
            },
          ],
        },
      },
      relationships: {
        list: { data: { type: "list", id: args.listId } },
      },
    },
  };

  const res = await fetch(
    `${KLAVIYO_API_BASE}/profile-subscription-bulk-create-jobs`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    },
  );

  if (!res.ok && res.status !== 202) {
    const text = await res.text().catch(() => "");
    console.error("[klaviyo] subscribeToList failed", res.status, text);
  }
}
