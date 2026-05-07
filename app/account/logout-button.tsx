"use client";

import { useState } from "react";
import { clearLocalStorage } from "lib/cart/store";

export function LogoutButton() {
  const [pending, setPending] = useState(false);

  async function logout() {
    if (pending) return;
    setPending(true);
    // POST then full-page reload to homepage. /api/auth/logout returns a 303
    // to /, but fetch() doesn't follow redirects across origins/methods
    // reliably for cookie-clearing flows; do an explicit window.location swap.
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } catch {
      // Logout is fire-and-forget — clear local state regardless.
    }
    // Per Phase 4 spec: clear localStorage cart so the next guest on this
    // browser doesn't see the previous user's cart. Server cart in Postgres
    // is preserved for the next login — that's the source of truth.
    clearLocalStorage();
    window.location.assign("/");
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
