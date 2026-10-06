"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { track } from "lib/analytics";
import { captureAttribution } from "lib/attribution";

/**
 * <RouteAnalytics /> — fires `page_view` on first paint and on every
 * client-side navigation.
 *
 * Why this exists: the site is a single-page app. The Meta Pixel base snippet
 * and GA4's default page_view only fire on a hard load, so in-site navigation
 * was invisible — Meta effectively saw one page per visitor. This closes that.
 *
 * Uses `usePathname()` only, deliberately. `useSearchParams()` would force
 * every page under this component into a Suspense boundary; the query string
 * is read from `window.location` instead, which needs no such boundary.
 */
export function RouteAnalytics() {
  const pathname = usePathname();
  const lastFired = useRef<string | null>(null);

  useEffect(() => {
    const url = pathname + window.location.search;
    // React may run effects twice in dev; a route is only ever one page view.
    if (lastFired.current === url) return;
    lastFired.current = url;

    // Save ad and campaign parameters before anything else reads the URL.
    captureAttribution();

    track("page_view", {
      page_path: url,
      page_title: document.title,
    });
  }, [pathname]);

  return null;
}
