"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useCart } from "components/cart/cart-context";
import {
  freeShippingProgress,
  shippingCents,
  subtotalCents,
} from "lib/cart/pricing";
import { FREE_SHIPPING_THRESHOLD_CENTS } from "lib/stripe-constants";

type CartDrawerProps = {
  open: boolean;
  onClose: () => void;
};

function formatMoneyCents(cents: number): string {
  if (!Number.isFinite(cents)) return "$0";
  const value = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * <CartDrawer /> — slide-from-right cart drawer.
 * Reads cart from useCart() — Mujo on-site cart, keyed off Stripe Price IDs.
 * Free-shipping threshold reads from FREE_SHIPPING_THRESHOLD_CENTS in
 * lib/stripe-constants.ts (single source of truth, currently $50).
 */
export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const { cart, totalQuantity, updateQuantity, removeItem } = useCart();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const subtotal = subtotalCents(cart);
  const shipping = shippingCents(subtotal);
  const total = subtotal + shipping;
  const { remainingCents, pct, unlocked } = freeShippingProgress(subtotal);
  const empty = totalQuantity === 0;

  // The on-site /checkout page (Phase 2) handles both one-time and
  // subscription modes via Stripe Elements. The legacy /api/checkout Hosted
  // session creator stays alive as a 308 compat shim for stale tabs (next.config.ts).
  const checkoutHref = empty ? "/shop" : "/checkout";

  return (
    <aside
      className={`cart-drawer ${open ? "open" : ""}`}
      aria-hidden={!open}
      aria-label="Shopping cart"
    >
      <div className="cart-head">
        <div className="cart-head-title">
          Your cart{" "}
          <span>
            {totalQuantity === 1 ? "1 item" : `${totalQuantity} items`}
          </span>
        </div>
        <button
          type="button"
          className="cart-close"
          aria-label="Close cart"
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

      <div className="cart-progress">
        <div className="cart-progress-msg">
          {unlocked ? (
            <>
              <strong>Free shipping</strong> unlocked. Nice work.
            </>
          ) : empty ? (
            <>
              Free shipping at{" "}
              <strong>
                {formatMoneyCents(FREE_SHIPPING_THRESHOLD_CENTS)}
              </strong>
              .
            </>
          ) : (
            <>
              <span className="accent">{formatMoneyCents(remainingCents)}</span>{" "}
              away from <strong>free shipping</strong>.
            </>
          )}
        </div>
        <div className="cart-progress-track">
          <div
            className={`cart-progress-fill ${unlocked ? "full" : ""}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="cart-body">
        {empty ? (
          <div className="cart-empty">
            <div className="cart-empty-illo" aria-hidden>
              🍵
            </div>
            <h3>Nothing in here yet.</h3>
            <p>
              Your ritual is one click away. The Mujo Ritual is the place most
              people start.
            </p>
            <Link href="/shop">Browse the shop →</Link>
          </div>
        ) : (
          cart.items.map((item) => (
            <div className="cart-item" key={item.stripePriceId}>
              <div className="cart-item-img">
                {item.image?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image.url} alt={item.image.alt} />
                ) : (
                  <span aria-hidden>🍵</span>
                )}
              </div>
              <div className="cart-item-info">
                <Link
                  href={`/products/${item.productHandle}`}
                  onClick={onClose}
                  className="cart-item-name"
                >
                  {item.productTitle}
                </Link>
                <div className="cart-item-variant">{item.variantTitle}</div>
                <div className="cart-item-controls">
                  <button
                    type="button"
                    className="qty-btn"
                    aria-label="Decrease quantity"
                    onClick={() =>
                      updateQuantity(item.stripePriceId, item.quantity - 1)
                    }
                  >
                    −
                  </button>
                  <span className="qty-val">{item.quantity}</span>
                  <button
                    type="button"
                    className="qty-btn"
                    aria-label="Increase quantity"
                    onClick={() =>
                      updateQuantity(item.stripePriceId, item.quantity + 1)
                    }
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="cart-item-meta">
                <div className="cart-item-price">
                  {formatMoneyCents(item.unitAmountCents * item.quantity)}
                </div>
                <button
                  type="button"
                  className="cart-item-remove"
                  onClick={() => removeItem(item.stripePriceId)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="cart-foot">
        <div className="cart-row">
          <span>Subtotal</span>
          <span className="price">
            {empty ? "$0" : formatMoneyCents(subtotal)}
          </span>
        </div>
        <div className="cart-row">
          <span>Shipping</span>
          <span className="price">
            {empty
              ? "—"
              : unlocked
                ? "Free"
                : "Calculated at checkout"}
          </span>
        </div>
        <div className="cart-row total">
          <span>Total</span>
          <span className="price">
            {empty ? "$0" : formatMoneyCents(total)}
          </span>
        </div>
        <div className="cart-shipping-note">
          Taxes calculated at checkout. Subscription orders renew at 15% off
          retail.
        </div>
        <Link
          className="cart-checkout"
          href={checkoutHref}
          prefetch={!empty}
          onClick={onClose}
        >
          {empty ? "Browse the shop" : "Checkout"}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="13 6 19 12 13 18" />
          </svg>
        </Link>
        <div className="cart-secure">Secure · Stripe checkout</div>
      </div>

      <style>{`
        .cart-drawer {
          position: fixed;
          top: 0; right: 0; bottom: 0;
          width: min(440px, 100vw);
          background: var(--cream);
          z-index: 999;
          transform: translateX(100%);
          transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
          display: flex;
          flex-direction: column;
          box-shadow: var(--shadow-drawer);
        }
        .cart-drawer.open { transform: translateX(0); }
        .cart-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--line);
        }
        .cart-head-title {
          font-family: var(--f-display);
          font-size: 18px;
          font-weight: 500;
          letter-spacing: -0.01em;
        }
        .cart-head-title span {
          font-family: var(--f-mono);
          font-size: 11px;
          color: var(--mute);
          letter-spacing: 0.1em;
          margin-left: 8px;
          font-weight: 400;
        }
        .cart-close {
          width: 36px; height: 36px;
          background: transparent;
          border: none;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--ink);
          border-radius: 50%;
          margin-right: -6px;
        }
        .cart-close:hover { background: var(--sage-tint); }
        .cart-close svg { width: 18px; height: 18px; }
        .cart-progress {
          background: var(--sand);
          padding: 14px 20px 16px;
          border-bottom: 1px solid var(--line);
        }
        .cart-progress-msg {
          font-size: 13px;
          color: var(--ink-soft);
          margin-bottom: 8px;
          line-height: 1.4;
        }
        .cart-progress-msg strong { color: var(--ink); font-weight: 500; }
        .cart-progress-msg .accent { color: var(--orange-deep); font-weight: 500; }
        .cart-progress-track {
          height: 6px;
          background: rgba(26, 26, 26, 0.08);
          border-radius: 3px;
          overflow: hidden;
        }
        .cart-progress-fill {
          height: 100%;
          background: var(--orange);
          border-radius: 3px;
          width: 0%;
          transition: width 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .cart-progress-fill.full { background: var(--sage); }
        .cart-body {
          flex: 1;
          overflow-y: auto;
          padding: 8px 20px;
        }
        .cart-item {
          display: grid;
          grid-template-columns: 72px 1fr auto;
          gap: 14px;
          padding: 16px 0;
          border-bottom: 1px solid var(--line);
        }
        .cart-item-img {
          width: 72px; height: 72px;
          background: var(--sand);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          flex-shrink: 0;
          overflow: hidden;
        }
        .cart-item-img img { width: 100%; height: 100%; object-fit: cover; }
        .cart-item-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .cart-item-name {
          font-size: 14px;
          font-weight: 500;
          color: var(--ink);
          line-height: 1.3;
          text-decoration: none;
        }
        .cart-item-name:hover { color: var(--orange-deep); }
        .cart-item-variant {
          font-size: 12px;
          color: var(--mute);
          margin-bottom: 6px;
        }
        .cart-item-controls {
          display: inline-flex;
          align-items: center;
          border: 1px solid var(--line);
          border-radius: 100px;
          background: #fff;
          width: fit-content;
          margin-top: auto;
        }
        .qty-btn {
          width: 28px; height: 28px;
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 14px;
          color: var(--ink-soft);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .qty-btn:hover { color: var(--orange-deep); }
        .qty-val {
          font-family: var(--f-mono);
          font-size: 12px;
          min-width: 24px;
          text-align: center;
          color: var(--ink);
        }
        .cart-item-meta {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          justify-content: space-between;
          text-align: right;
        }
        .cart-item-price {
          font-family: var(--f-mono);
          font-size: 13px;
          font-weight: 500;
          color: var(--ink);
        }
        .cart-item-remove {
          background: transparent;
          border: none;
          cursor: pointer;
          font-family: var(--f-mono);
          font-size: 10px;
          color: var(--mute);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          padding: 4px 0;
        }
        .cart-item-remove:hover { color: var(--orange-deep); }
        .cart-empty {
          text-align: center;
          padding: 56px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }
        .cart-empty-illo { font-size: 52px; opacity: 0.5; }
        .cart-empty h3 { font-size: 22px; font-weight: 500; }
        .cart-empty p {
          font-size: 14px;
          color: var(--mute);
          max-width: 260px;
          line-height: 1.5;
        }
        .cart-empty a {
          margin-top: 6px;
          background: var(--orange);
          color: #fff;
          text-decoration: none;
          padding: 12px 22px;
          border-radius: 100px;
          font-size: 14px;
          font-weight: 500;
        }
        .cart-empty a:hover { background: var(--orange-deep); }
        .cart-foot {
          border-top: 1px solid var(--line);
          padding: 16px 20px 20px;
          background: var(--cream);
        }
        .cart-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 4px 0;
          font-size: 14px;
          color: var(--ink-soft);
        }
        .cart-row.total {
          padding-top: 10px;
          font-size: 18px;
          font-weight: 500;
          color: var(--ink);
          font-family: var(--f-display);
        }
        .cart-row .price { font-family: var(--f-mono); }
        .cart-shipping-note {
          font-size: 11px;
          color: var(--mute);
          font-family: var(--f-mono);
          letter-spacing: 0.04em;
          margin: 8px 0 14px;
          line-height: 1.4;
        }
        .cart-checkout {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          background: var(--orange);
          color: #fff;
          text-decoration: none;
          border: none;
          cursor: pointer;
          padding: 16px 24px;
          border-radius: 100px;
          font-family: var(--f-body);
          font-size: 15px;
          font-weight: 500;
          transition: background 0.2s;
        }
        .cart-checkout:hover { background: var(--orange-deep); color: #fff; }
        .cart-secure {
          text-align: center;
          font-size: 11px;
          color: var(--mute);
          font-family: var(--f-mono);
          letter-spacing: 0.08em;
          margin-top: 10px;
          text-transform: uppercase;
        }
        @media (max-width: 600px) {
          .cart-head { padding: 12px 18px; }
          .cart-head-title { font-size: 16px; }
          .cart-progress { padding: 10px 18px 12px; }
          .cart-progress-msg { font-size: 12px; margin-bottom: 6px; }
          .cart-empty { padding: 28px 24px; gap: 10px; }
          .cart-empty-illo { font-size: 36px; }
          .cart-empty h3 { font-size: 18px; }
          .cart-empty p { font-size: 13px; }
          .cart-empty a { padding: 10px 18px; font-size: 13px; }
          .cart-body { padding: 4px 18px; }
          .cart-foot { padding: 12px 18px 16px; }
          .cart-row { font-size: 13px; padding: 3px 0; }
          .cart-row.total { font-size: 16px; padding-top: 8px; }
          .cart-shipping-note { font-size: 10px; margin: 6px 0 10px; }
          .cart-checkout { padding: 13px 22px; font-size: 14px; }
          .cart-secure { font-size: 10px; margin-top: 8px; }
        }
      `}</style>
    </aside>
  );
}
