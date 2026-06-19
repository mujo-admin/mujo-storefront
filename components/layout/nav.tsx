"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type NavProps = {
  cartCount: number;
  onOpenMenu: () => void;
  onOpenCart: () => void;
};

const NAV_LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/ingredients", label: "Ingredients" },
  { href: "/journal", label: "Journal" },
  { href: "/rebel-club", label: "Rebel Club" },
];

/**
 * <Nav /> — sticky 3-col nav. Source of truth: mujo_nav_system.html v1.0.
 * Mobile (<1024px): hamburger | logo center | account+cart
 * Desktop (≥1024px): logo | center links | account+cart
 */
export function Nav({ cartCount, onOpenMenu, onOpenCart }: NavProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 8);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`mujo-nav ${scrolled ? "scrolled" : ""}`} aria-label="Main">
      <button
        type="button"
        className="nav-hamburger"
        aria-label="Open menu"
        onClick={onOpenMenu}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        >
          <line x1="3" y1="7" x2="21" y2="7" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="17" x2="21" y2="17" />
        </svg>
      </button>

      <Link href="/" className="nav-logo" aria-label="Mujo home">
        <img src="/images/logo/mujo-logo-orange.png" alt="Mujo" />
      </Link>

      <div className="nav-center">
        {NAV_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="nav-link">
            {l.label}
          </Link>
        ))}
      </div>

      <div className="nav-right">
        <Link
          href="/account"
          className="nav-icon"
          aria-label="Account"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
          </svg>
        </Link>
        <button
          type="button"
          className="nav-icon"
          aria-label="Cart"
          onClick={onOpenCart}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 7h14l-1.4 11.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L5 7z" />
            <path d="M9 7V5a3 3 0 0 1 6 0v2" />
          </svg>
          <span className={`cart-count ${cartCount === 0 ? "hidden" : ""}`}>
            {cartCount}
          </span>
        </button>
      </div>

      <style>{`
        .mujo-nav {
          position: sticky;
          top: 0;
          z-index: 150;
          background: rgba(243, 242, 233, 0.94);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--line);
          padding: 12px 16px;
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: 12px;
          height: var(--nav-h);
          transition: box-shadow 0.3s;
        }
        .mujo-nav.scrolled { box-shadow: 0 2px 20px rgba(0,0,0,0.06); }
        @media (min-width: 1024px) {
          .mujo-nav { padding: 14px 32px; grid-template-columns: 1fr auto 1fr; gap: 24px; }
        }
        .nav-hamburger {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--ink);
        }
        .nav-hamburger svg { width: 22px; height: 22px; }
        @media (min-width: 1024px) { .nav-hamburger { display: none; } }
        .nav-logo {
          display: inline-flex;
          align-items: center;
          text-decoration: none;
          justify-self: center;
        }
        .nav-logo img { height: 26px; width: auto; display: block; }
        @media (min-width: 1024px) {
          .nav-logo { justify-self: start; }
          .nav-logo img { height: 30px; }
        }
        .nav-center {
          display: none;
          justify-content: center;
          align-items: center;
          gap: 32px;
        }
        @media (min-width: 1024px) { .nav-center { display: flex; } }
        .nav-link {
          font-family: var(--f-body);
          font-size: 14px;
          color: var(--ink-soft);
          text-decoration: none;
          font-weight: 500;
          letter-spacing: 0.01em;
          transition: color 0.2s;
          padding: 4px 0;
        }
        .nav-link:hover { color: var(--sage); }
        .nav-link:focus { outline: none; }
        .nav-link:focus-visible { outline: 2px solid var(--sage); outline-offset: 6px; border-radius: 2px; }
        .nav-right {
          display: flex;
          align-items: center;
          gap: 4px;
          justify-self: end;
        }
        .nav-icon {
          width: 40px;
          height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: none;
          background: transparent;
          color: var(--ink);
          cursor: pointer;
          text-decoration: none;
          position: relative;
          border-radius: 50%;
          transition: background 0.2s;
        }
        .nav-icon:hover { background: var(--sage-tint); }
        .nav-icon svg { width: 20px; height: 20px; }
        .cart-count {
          position: absolute;
          top: 4px; right: 4px;
          background: var(--orange);
          color: #fff;
          font-family: var(--f-mono);
          font-size: 9px;
          font-weight: 500;
          min-width: 16px;
          height: 16px;
          border-radius: var(--r-tag);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
          line-height: 1;
        }
        .cart-count.hidden { display: none; }
      `}</style>
    </nav>
  );
}
