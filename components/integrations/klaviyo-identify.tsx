"use client";

import { useEffect, useRef } from "react";
import { identify } from "lib/analytics";

/**
 * <KlaviyoIdentify /> — tells Klaviyo who a signed-in customer is.
 *
 * Klaviyo records on-site events (product views, carts, checkouts) only for
 * browsers it can tie to a profile. A customer who signed in with a magic link
 * is known to us, so this passes the session email along once per page load.
 * Renders nothing; no-ops for guests and for visitors who declined cookies.
 */
export function KlaviyoIdentify({ email }: { email: string | null }) {
  const sent = useRef<string | null>(null);

  useEffect(() => {
    if (!email || sent.current === email) return;
    sent.current = email;
    identify(email);
  }, [email]);

  return null;
}
