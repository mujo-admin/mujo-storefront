// Shared chrome for the /account/* surface — hero + horizontal tabs.
// Mirrors the canonical design in `context/import/New website build/mujo_account_*.html`.
//
// Server component. Takes the active tab + page-specific hero copy and
// wraps any page contents in the shared layout. Each tab links to the
// corresponding /account/* route. "Sign out" is rendered as a client form
// to POST /api/auth/logout (LogoutButton handles the localStorage-cart clear).

import Link from "next/link";
import type { ReactNode } from "react";
import { LogoutButton } from "../../app/account/logout-button";

export type AccountTab = "overview" | "subscription" | "orders" | "profile";

const TABS: Array<{
  id: AccountTab;
  href: string;
  label: string;
  icon: ReactNode;
}> = [
  {
    id: "overview",
    href: "/account",
    label: "Overview",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    id: "subscription",
    href: "/account/subscription",
    label: "Subscription",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
        <polyline points="3 16 3 21 8 21" />
        <polyline points="21 8 21 3 16 3" />
      </svg>
    ),
  },
  {
    id: "orders",
    href: "/account/orders",
    label: "Orders",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 7h14l-1.4 11.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L5 7z" />
        <path d="M9 7V5a3 3 0 0 1 6 0v2" />
      </svg>
    ),
  },
  {
    id: "profile",
    href: "/account/profile",
    label: "Profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
      </svg>
    ),
  },
];

export function AccountChrome({
  activeTab,
  eyebrow,
  title,
  titleAccent,
  lede,
  containerWidth = "wide",
  children,
}: {
  activeTab: AccountTab;
  /** Eyebrow text (e.g. "Account" or "Account · Subscription"). */
  eyebrow: string;
  /** Title text before the italic accent. */
  title: string;
  /** Italic-orange accent rendered as <em> after the title. e.g. "Kinga." */
  titleAccent: string;
  /** Lede paragraph below the H1. */
  lede: string;
  /** "wide" = 1240px (dashboard), "narrow" = 760px (orders/sub/profile/payment). */
  containerWidth?: "wide" | "narrow";
  children: ReactNode;
}) {
  const containerClass =
    containerWidth === "wide" ? "acc-container" : "acc-container acc-container-narrow";

  return (
    <div className="acc-shell">
      <section className="acc-hero">
        <div className={containerClass}>
          <span className="acc-eyebrow">{eyebrow}</span>
          <h1 className="acc-title">
            {title} <em>{titleAccent}</em>
          </h1>
          <p className="acc-lede">{lede}</p>
        </div>
      </section>

      <div className={containerClass}>
        <div className="acc-tabs">
          <div className="acc-tabs-row">
            {TABS.map((tab) => (
              <Link
                key={tab.id}
                href={tab.href}
                className={`acc-tab${tab.id === activeTab ? " active" : ""}`}
              >
                <span className="acc-tab-icon">{tab.icon}</span>
                {tab.label}
              </Link>
            ))}
            <span className="acc-signout-wrap">
              <LogoutButton variant="link" />
            </span>
          </div>
        </div>
        {children}
      </div>

      <style>{`
        .acc-shell {
          background: var(--cream);
          min-height: calc(100vh - 100px);
          font-family: var(--f-body);
          color: var(--ink);
        }
        .acc-container {
          max-width: 1240px;
          margin: 0 auto;
          padding: 0 20px;
        }
        .acc-container-narrow { max-width: 760px; }
        @media (min-width: 768px) {
          .acc-container { padding: 0 32px; }
        }

        .acc-hero {
          padding: 32px 0 20px;
        }
        @media (min-width: 768px) {
          .acc-hero { padding: 48px 0 28px; }
        }
        .acc-eyebrow {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--orange-deep);
          font-weight: 500;
          display: inline-block;
          margin-bottom: 12px;
        }
        .acc-title {
          font-family: var(--f-display);
          font-weight: 500;
          font-size: clamp(28px, 5vw, 42px);
          letter-spacing: -0.02em;
          margin: 0 0 8px;
          line-height: 1.05;
          color: var(--ink);
        }
        .acc-title em {
          font-family: var(--f-serif);
          font-style: italic;
          color: var(--orange);
          font-weight: 400;
        }
        .acc-lede {
          font-size: 15px;
          color: var(--ink-soft);
          line-height: 1.55;
          margin: 0;
          max-width: 540px;
        }

        .acc-tabs {
          border-bottom: 1px solid rgba(26, 26, 26, 0.06);
          margin-bottom: 28px;
          overflow-x: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .acc-tabs::-webkit-scrollbar { display: none; }
        .acc-tabs-row {
          display: flex;
          gap: 4px;
          min-width: max-content;
          align-items: stretch;
        }
        .acc-tab {
          padding: 12px 16px;
          font-family: var(--f-body);
          font-size: 14px;
          color: var(--ink-soft);
          text-decoration: none;
          font-weight: 500;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          white-space: nowrap;
          transition: color 0.2s, border-color 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .acc-tab:hover { color: var(--ink); }
        .acc-tab.active {
          color: var(--ink);
          border-bottom-color: var(--orange);
        }
        .acc-tab-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .acc-tab-icon svg {
          width: 14px;
          height: 14px;
        }
        .acc-signout-wrap {
          margin-left: auto;
          padding: 12px 16px;
        }
      `}</style>
    </div>
  );
}
