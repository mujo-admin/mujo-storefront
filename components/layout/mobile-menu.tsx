"use client";

import Link from "next/link";
import { useEffect } from "react";

type MobileMenuProps = {
  open: boolean;
  onClose: () => void;
};

const MENU_LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/science", label: "Science" },
  { href: "/ingredients", label: "Ingredients" },
  { href: "/journal", label: "Journal" },
  { href: "/rebel-club", label: "Rebel Club" },
  { href: "/about", label: "About" },
  { href: "/account", label: "Account" },
];

const ArrowIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="13 6 19 12 13 18" />
  </svg>
);

/**
 * <MobileMenu /> — slide-from-left full-height drawer.
 * Source: mujo_nav_system.html v1.0.
 */
export function MobileMenu({ open, onClose }: MobileMenuProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside
      className={`mobile-menu ${open ? "open" : ""}`}
      aria-hidden={!open}
      aria-label="Mobile menu"
    >
      <div className="mm-head">
        <Link href="/" aria-label="Mujo home" onClick={onClose}>
          <img src="/images/logo/mujo-logo-orange.png" alt="Mujo" />
        </Link>
        <button
          type="button"
          className="mm-close"
          aria-label="Close menu"
          onClick={onClose}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>
      </div>
      <div className="mm-links">
        {MENU_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="mm-link"
            onClick={onClose}
          >
            {l.label}
            <ArrowIcon />
          </Link>
        ))}
      </div>
      <div className="mm-foot">
        <div className="mm-foot-eyebrow">New here</div>
        <p>
          10% off your first order. Take 60 seconds, get a Reset Plan tuned to
          your specific pattern.
        </p>
        <Link href="/rebel-club" className="mm-cta" onClick={onClose}>
          Join the Rebel Club →
        </Link>
      </div>

      <style>{`
        .mobile-menu {
          position: fixed;
          top: 0; left: 0; bottom: 0;
          width: min(360px, 88vw);
          background: var(--cream);
          z-index: 999;
          transform: translateX(-100%);
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }
        .mobile-menu.open { transform: translateX(0); }
        .mm-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--line);
        }
        .mm-head img { height: 26px; width: auto; }
        .mm-close {
          width: 40px; height: 40px;
          background: transparent;
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--ink);
          margin-right: -8px;
        }
        .mm-close svg { width: 20px; height: 20px; }
        .mm-links {
          display: flex;
          flex-direction: column;
          padding: 4px 0;
          flex: 1;
        }
        .mm-link {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          font-family: var(--f-display);
          font-size: 22px;
          font-weight: 500;
          letter-spacing: -0.01em;
          color: var(--ink);
          text-decoration: none;
          border-bottom: 1px solid var(--line);
          transition: background 0.15s, color 0.15s;
        }
        .mm-link:hover { color: var(--orange-deep); background: rgba(242, 104, 47, 0.04); }
        .mm-link svg { width: 16px; height: 16px; opacity: 0.4; }
        .mm-foot {
          padding: 24px;
          background: var(--sage);
          color: #fff;
        }
        .mm-foot-eyebrow {
          font-family: var(--f-mono);
          font-size: 10px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--orange);
          margin-bottom: 10px;
        }
        .mm-foot p {
          font-size: 14px;
          line-height: 1.55;
          color: rgba(255,255,255,0.7);
          margin-bottom: 16px;
        }
        .mm-cta {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--orange);
          color: #fff;
          text-decoration: none;
          padding: 12px 20px;
          border-radius: 100px;
          font-size: 14px;
          font-weight: 500;
          font-family: var(--f-body);
          transition: background 0.2s;
        }
        .mm-cta:hover { background: var(--orange-deep); }
        @media (max-width: 600px) {
          .mm-head { padding: 12px 18px; }
          .mm-head img { height: 22px; }
          .mm-link { padding: 13px 22px; font-size: 17px; }
          .mm-link svg { width: 14px; height: 14px; }
          .mm-foot { padding: 18px 22px; }
          .mm-foot-eyebrow { margin-bottom: 8px; }
          .mm-foot p { font-size: 13px; margin-bottom: 12px; line-height: 1.5; }
          .mm-cta { padding: 10px 18px; font-size: 13px; }
        }
      `}</style>
    </aside>
  );
}
