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

/**
 * Marketing-consent state for the email channel. Klaviyo's profile object exposes
 * a per-channel consent string; we collapse it to a 3-state union for UI.
 */
export type MarketingConsent = "subscribed" | "unsubscribed" | "unknown";

/**
 * Read the email-marketing consent for a profile by email.
 *
 * Returns:
 *   - "subscribed"   — profile has explicit SUBSCRIBED consent
 *   - "unsubscribed" — profile has explicit UNSUBSCRIBED consent, OR profile
 *                      exists with no consent set (NEVER_SUBSCRIBED — the
 *                      common case for customers who came in via Stripe
 *                      Checkout without ever opting in to a Klaviyo form)
 *   - "unknown"      — Klaviyo private key isn't configured (dev/staging),
 *                      or the API call errored
 *
 * Used by the /account dashboard + profile pages to render the master toggle's
 * current state. Treating "no consent set" as "unsubscribed" matches the
 * customer's experience (no marketing emails are being sent) and gives them a
 * meaningful initial state in the toggle.
 */
export async function getEmailMarketingConsent(
  email: string,
): Promise<MarketingConsent> {
  if (!privateKey()) return "unknown";
  const url = new URL(`${KLAVIYO_API_BASE}/profiles`);
  url.searchParams.set("filter", `equals(email,"${email}")`);
  url.searchParams.set("fields[profile]", "subscriptions");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: authHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[klaviyo] getEmailMarketingConsent failed", res.status, text);
    return "unknown";
  }

  const json = (await res.json()) as {
    data?: Array<{
      attributes?: {
        subscriptions?: {
          email?: {
            marketing?: { consent?: string };
          };
        };
      };
    }>;
  };

  // No profile at all — can't determine state, but for dashboard display
  // purposes "unsubscribed" is the safe assumption (no profile means no
  // marketing emails are being sent).
  const profile = json.data?.[0];
  if (!profile) return "unsubscribed";

  // Profile exists. Read consent — anything other than explicit SUBSCRIBED
  // is "unsubscribed" from the customer's perspective.
  const consent = profile.attributes?.subscriptions?.email?.marketing?.consent;
  if (consent && consent.toUpperCase() === "SUBSCRIBED") return "subscribed";
  return "unsubscribed";
}

/**
 * Update the email-marketing consent for a profile by email. Subscribing also
 * adds the profile to KLAVIYO_NEWSLETTER_LIST_ID (the master list) so the
 * subscription has somewhere to live; unsubscribing flips the channel-level
 * consent which globally suppresses marketing sends.
 */
export async function setEmailMarketingConsent(args: {
  email: string;
  consent: "subscribed" | "unsubscribed";
  customSource?: string;
}): Promise<void> {
  if (!privateKey()) return;

  if (args.consent === "subscribed") {
    const listId = process.env.KLAVIYO_NEWSLETTER_LIST_ID;
    if (!listId) {
      console.error("[klaviyo] KLAVIYO_NEWSLETTER_LIST_ID not set");
      return;
    }
    await subscribeToList({
      email: args.email,
      listId,
      customSource: args.customSource ?? "Account profile toggle",
    });
    return;
  }

  // Unsubscribe — channel-level consent flip via the bulk-unsubscribe job.
  // This globally suppresses marketing sends across all lists for this profile.
  const body = {
    data: {
      type: "profile-subscription-bulk-delete-job",
      attributes: {
        profiles: {
          data: [
            {
              type: "profile",
              attributes: {
                email: args.email,
                subscriptions: {
                  email: { marketing: { consent: "UNSUBSCRIBED" } },
                },
              },
            },
          ],
        },
      },
    },
  };

  const res = await fetch(
    `${KLAVIYO_API_BASE}/profile-subscription-bulk-delete-jobs`,
    {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    },
  );

  if (!res.ok && res.status !== 202) {
    const text = await res.text().catch(() => "");
    console.error("[klaviyo] setEmailMarketingConsent unsubscribe failed", res.status, text);
  }
}

/**
 * Read the list memberships for a profile by email. Returns [] if the profile
 * doesn't exist or Klaviyo is unconfigured. Used by the gift-recipient capture
 * flow to skip senders who are already in any Mujo list (don't spam them).
 */
export async function getProfileListMemberships(
  email: string,
): Promise<Array<{ id: string; name: string }>> {
  if (!privateKey()) return [];
  const profile = await getProfileByEmail(email);
  if (!profile) return [];

  const res = await fetch(
    `${KLAVIYO_API_BASE}/profiles/${profile.id}/lists`,
    {
      method: "GET",
      headers: authHeaders(),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      "[klaviyo] getProfileListMemberships failed",
      res.status,
      text,
    );
    return [];
  }
  const json = (await res.json()) as {
    data?: Array<{ id: string; attributes?: { name?: string } }>;
  };
  return (json.data ?? []).map((l) => ({
    id: l.id,
    name: l.attributes?.name ?? "(unnamed)",
  }));
}

/**
 * Add a gift recipient to the gift-recipient list — IF they're not already in
 * any Mujo list. Skips if profile is in another list (means they're already
 * a Mujo contact — newsletter, Lemna waitlist, prior customer, etc. — and
 * we don't want to spam them).
 *
 * Powered by KLAVIYO_GIFT_RECIPIENT_LIST_ID env var. Kinga creates the list in
 * Klaviyo and supplies the ID. Each gifted recipient gets these properties on
 * their profile (Klaviyo flows can personalize from them):
 *   - gifted_by_email
 *   - gifted_product       (e.g. "The Ritual · 25 servings")
 *   - gifted_at            (ISO timestamp)
 *   - gift_message         (the sender's optional note, may be empty)
 *
 * Returns { added: boolean, reason?: string, existingLists?: string[] } so the
 * caller can log meaningfully. Never throws — soft-fails into added:false.
 */
export async function addGiftRecipientIfNew(args: {
  email: string;
  giftedByEmail: string;
  giftedProduct: string;
  giftMessage?: string;
}): Promise<{
  added: boolean;
  reason?: string;
  existingLists?: string[];
}> {
  const listId = process.env.KLAVIYO_GIFT_RECIPIENT_LIST_ID;
  if (!listId) {
    console.warn(
      "[klaviyo] KLAVIYO_GIFT_RECIPIENT_LIST_ID not set — gift recipient capture is no-op",
    );
    return { added: false, reason: "list_not_configured" };
  }
  if (!privateKey()) {
    return { added: false, reason: "klaviyo_not_configured" };
  }

  try {
    const memberships = await getProfileListMemberships(args.email);
    if (memberships.length > 0) {
      console.log("[klaviyo] gift recipient already in Mujo lists — skipping", {
        email: args.email,
        lists: memberships.map((l) => l.name),
      });
      return {
        added: false,
        reason: "already_in_lists",
        existingLists: memberships.map((l) => l.name),
      };
    }

    await subscribeToList({
      email: args.email,
      listId,
      customSource: "Gift Recipient",
      properties: {
        gifted_by_email: args.giftedByEmail,
        gifted_product: args.giftedProduct,
        gifted_at: new Date().toISOString(),
        gift_message: args.giftMessage ?? "",
      },
    });
    console.log("[klaviyo] gift recipient added to list", {
      email: args.email,
      product: args.giftedProduct,
    });
    return { added: true };
  } catch (err) {
    console.error("[klaviyo] addGiftRecipientIfNew unexpected error", err);
    return { added: false, reason: "error" };
  }
}

/**
 * Look up a Klaviyo profile by email and return its profile ID + name.
 * Used by the email-change re-verify flow + profile dashboard rendering.
 */
export async function getProfileByEmail(email: string): Promise<{
  id: string;
  firstName: string | null;
  lastName: string | null;
} | null> {
  if (!privateKey()) return null;
  const url = new URL(`${KLAVIYO_API_BASE}/profiles`);
  url.searchParams.set("filter", `equals(email,"${email}")`);
  url.searchParams.set("fields[profile]", "first_name,last_name");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: authHeaders(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[klaviyo] getProfileByEmail failed", res.status, text);
    return null;
  }

  const json = (await res.json()) as {
    data?: Array<{
      id: string;
      attributes?: { first_name?: string | null; last_name?: string | null };
    }>;
  };
  const profile = json.data?.[0];
  if (!profile) return null;
  return {
    id: profile.id,
    firstName: profile.attributes?.first_name ?? null,
    lastName: profile.attributes?.last_name ?? null,
  };
}

/**
 * Update the primary email on a Klaviyo profile via the merge-profiles flow.
 * This is the API-correct way to handle email changes without creating
 * duplicate profiles. If a profile already exists at `newEmail`, Klaviyo will
 * merge the two; otherwise the existing profile's email is updated in place.
 */
export async function changeProfileEmail(args: {
  oldEmail: string;
  newEmail: string;
}): Promise<void> {
  if (!privateKey()) return;

  const sourceProfile = await getProfileByEmail(args.oldEmail);
  if (!sourceProfile) {
    console.warn("[klaviyo] changeProfileEmail: no source profile", {
      oldEmail: args.oldEmail,
    });
    return;
  }

  // PATCH the profile with the new email. If a profile exists at newEmail,
  // Klaviyo's merge_profiles handles the conflict; otherwise the source
  // profile's email is updated in place.
  const body = {
    data: {
      type: "profile",
      id: sourceProfile.id,
      attributes: {
        email: args.newEmail,
      },
    },
  };

  const res = await fetch(`${KLAVIYO_API_BASE}/profiles/${sourceProfile.id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // 409 = conflict (a profile already exists at newEmail). Fall back to
    // explicit merge.
    if (res.status === 409) {
      await mergeProfiles({
        sourceId: sourceProfile.id,
        destinationEmail: args.newEmail,
      });
      return;
    }
    console.error("[klaviyo] changeProfileEmail failed", res.status, text);
  }
}

/**
 * Explicit merge — used as a fallback when the email-change PATCH conflicts.
 * Source profile is merged into the profile already living at destinationEmail.
 */
async function mergeProfiles(args: {
  sourceId: string;
  destinationEmail: string;
}): Promise<void> {
  const dest = await getProfileByEmail(args.destinationEmail);
  if (!dest) {
    console.error("[klaviyo] mergeProfiles: no destination profile to merge into");
    return;
  }
  const body = {
    data: {
      type: "profile-merge",
      id: dest.id,
      relationships: {
        profiles: { data: [{ type: "profile", id: args.sourceId }] },
      },
    },
  };
  const res = await fetch(`${KLAVIYO_API_BASE}/profiles/${dest.id}/merge`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[klaviyo] mergeProfiles failed", res.status, text);
  }
}
