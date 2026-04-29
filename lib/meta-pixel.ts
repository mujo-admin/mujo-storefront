/**
 * Meta Pixel — client-side event helpers.
 * Pixel is initialized via <MetaPixelScript /> in app/layout.tsx; this module
 * just wraps `window.fbq(...)` so call sites stay typed and testable.
 *
 * Server-side mirror lives in lib/meta-capi.ts. Pair every event there with
 * the same `eventId` to deduplicate via Meta's Conversions API.
 */

declare global {
  interface Window {
    fbq?: (
      action: string,
      eventName: string,
      params?: Record<string, unknown>,
      options?: { eventID?: string },
    ) => void;
  }
}

export function trackPixelEvent(
  name: string,
  params: Record<string, unknown> = {},
  eventId?: string,
): void {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", name, params, eventId ? { eventID: eventId } : undefined);
}

export function trackPageView(eventId?: string): void {
  trackPixelEvent("PageView", {}, eventId);
}

export function generateEventId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
