"use client";

import { useState } from "react";
import { clearLocalStorage } from "lib/cart/store";

/**
 * Sign-out CTA. Two variants:
 *   - "button" (default) — pill-shaped button with border.
 *   - "link"             — inline mono-uppercase link, used inside the
 *                          <AccountChrome /> tab row (matches canonical
 *                          design's `.acc-signout`).
 */
export function LogoutButton({
  variant = "button",
}: {
  variant?: "button" | "link";
}) {
  const [pending, setPending] = useState(false);

  async function logout() {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Logout is fire-and-forget — clear local state regardless.
    }
    // Clear localStorage cart so the next guest on this browser doesn't see
    // the previous user's cart (server cart in Postgres is preserved).
    clearLocalStorage();
    window.location.assign("/");
  }

  if (variant === "link") {
    return (
      <a
        href="#sign-out"
        onClick={(e) => {
          e.preventDefault();
          logout();
        }}
        className="acc-signout-link"
        aria-disabled={pending}
      >
        {pending ? "Signing out…" : "Sign out"}
        <style>{`
          .acc-signout-link {
            font-family: var(--f-mono);
            font-size: 11px;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: var(--mute);
            text-decoration: none;
            transition: color 0.2s;
            cursor: pointer;
          }
          .acc-signout-link:hover { color: var(--orange-deep); }
          .acc-signout-link[aria-disabled="true"] { opacity: 0.6; cursor: not-allowed; }
        `}</style>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="logout-btn"
    >
      {pending ? "Signing out…" : "Sign out"}
      <style>{`
        .logout-btn {
          background: transparent;
          color: var(--ink-soft);
          border: 1px solid var(--line);
          cursor: pointer;
          padding: 11px 22px;
          border-radius: 100px;
          font-family: var(--f-body);
          font-size: 14px;
          font-weight: 500;
          transition: border-color 0.15s, color 0.15s;
        }
        .logout-btn:hover:not(:disabled) {
          border-color: var(--orange);
          color: var(--orange-deep);
        }
        .logout-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </button>
  );
}
