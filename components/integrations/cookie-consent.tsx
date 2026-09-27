"use client";

import { useEffect, useState } from "react";

/**
 * <CookieConsent /> — a light, one-line consent bar.
 *
 * Mujo ships US-only and is almost certainly under CCPA's thresholds, so this
 * is not a legal obligation — but `/legal/cookies` describes a choice, and the
 * site should offer the one it describes.
 *
 * Consent Mode v2 defaults are set before GTM loads (see AnalyticsScripts).
 * This component only records a decision and pushes the update.
 */

const STORAGE_KEY = "mujo_consent";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function persist(choice: "granted" | "denied") {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Private mode — the banner simply reappears next visit.
  }
  window.gtag?.("consent", "update", {
    ad_storage: choice,
    ad_user_data: choice,
    ad_personalization: choice,
    analytics_storage: choice,
  });
}

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const decide = (choice: "granted" | "denied") => {
    persist(choice);
    setVisible(false);
  };

  return (
    <div
      role="region"
      aria-label="Cookie choices"
      style={{
        position: "fixed",
        left: "16px",
        right: "16px",
        bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
        zIndex: 9999,
        maxWidth: "640px",
        margin: "0 auto",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "12px",
        padding: "14px 16px",
        borderRadius: "4px",
        background: "var(--c-ink, #1a1a18)",
        color: "var(--c-cream, #f3f2e9)",
        boxShadow: "0 6px 24px rgba(0,0,0,.18)",
        fontFamily: "var(--f-body, system-ui, sans-serif)",
        fontSize: "14px",
        lineHeight: 1.45,
      }}
    >
      <p style={{ margin: 0, flex: "1 1 260px" }}>
        We use cookies to understand how the site is used.{" "}
        <a
          href="/legal/cookies"
          style={{ color: "inherit", textDecoration: "underline" }}
        >
          How we use them
        </a>
        .
      </p>
      <div style={{ display: "flex", gap: "8px", flex: "0 0 auto" }}>
        <button
          type="button"
          onClick={() => decide("denied")}
          style={{
            padding: "8px 14px",
            borderRadius: "999px",
            border: "1px solid currentColor",
            background: "transparent",
            color: "inherit",
            font: "inherit",
            cursor: "pointer",
          }}
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => decide("granted")}
          style={{
            padding: "8px 14px",
            borderRadius: "999px",
            border: "1px solid var(--c-orange, #f2682f)",
            background: "var(--c-orange, #f2682f)",
            color: "var(--c-cream, #f3f2e9)",
            font: "inherit",
            cursor: "pointer",
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
