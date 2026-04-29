"use client";

import { useEffect } from "react";
import { useCart } from "components/cart/cart-context";

type CartDrawerProps = {
  open: boolean;
  onClose: () => void;
};

const SHIPPING_THRESHOLD_CENTS = 6000;

function formatMoney(amount: string | number, currencyCode = "USD") {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(value)) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currencyCode,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * <CartDrawer /> — slide-from-right cart drawer.
 * Source: mujo_nav_system.html v1.0 + 2026-04-22 free-shipping band carry-forward.
 * Reads cart from useCart() (W2 Shopify-backed CartContext).
 * Free-shipping threshold reads from --shipping-threshold-cents token (default $60).
 */
export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const { cart, updateCartItem } = useCart();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const lines = cart?.lines ?? [];
  const totalQuantity = cart?.totalQuantity ?? 0;
  const subtotalAmount = Number(cart?.cost?.subtotalAmount?.amount ?? 0);
  const currencyCode = cart?.cost?.subtotalAmount?.currencyCode ?? "USD";
  const subtotalCents = Math.round(subtotalAmount * 100);
  const remainingCents = Math.max(0, SHIPPING_THRESHOLD_CENTS - subtotalCents);
  const progressPct = Math.min(
    100,
    Math.round((subtotalCents / SHIPPING_THRESHOLD_CENTS) * 100),
  );
  const shippingUnlocked = totalQuantity > 0 && remainingCents <= 0;
  const empty = totalQuantity === 0;

  const checkoutUrl = cart?.checkoutUrl ?? "/api/checkout";

  return (
    <aside
      className={`cart-drawer ${open ? "open" : ""}`}
      aria-hidden={!open}
      aria-label="Shopping cart"
    >
      <div className="cart-head">
        <div className="cart-head-title">
          Your cart{" "}
          <span>{totalQuantity === 1 ? "1 item" : `${totalQuantity} items`}</span>
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
          {shippingUnlocked ? (
            <>
              <strong>Free shipping</strong> unlocked. Nice work.
            </>
          ) : empty ? (
            <>
              Free shipping at <strong>${SHIPPING_THRESHOLD_CENTS / 100}</strong>.
            </>
          ) : (
            <>
              <span className="accent">
                {formatMoney(remainingCents / 100, currencyCode)}
              </span>{" "}
              away from <strong>free shipping</strong>.
            </>
          )}
        </div>
        <div className="cart-progress-track">
          <div
            className={`cart-progress-fill ${shippingUnlocked ? "full" : ""}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="cart-body">
        {empty ? (
          <div className="cart-empty">
            <div className="cart-empty-illo" aria-hidden>🍵</div>
            <h3>Nothing in here yet.</h3>
            <p>
              Your ritual is one click away. The Mujo Ritual is the place most
              people start.
            </p>
            <a href="/shop">Browse the shop →</a>
          </div>
        ) : (
          lines.map((item) => (
            <div className="cart-item" key={item.merchandise.id}>
              <div className="cart-item-img">
                {item.merchandise.product.featuredImage ? (
                  <img
                    src={item.merchandise.product.featuredImage.url}
                    alt={item.merchandise.product.featuredImage.altText ?? ""}
                  />
                ) : (
                  <span aria-hidden>🍵</span>
                )}
              </div>
              <div className="cart-item-info">
                <div className="cart-item-name">
                  {item.merchandise.product.title}
                </div>
                <div className="cart-item-variant">{item.merchandise.title}</div>
                <div className="cart-item-controls">
                  <button
                    type="button"
                    className="qty-btn"
                    aria-label="Decrease quantity"
                    onClick={() =>
                      updateCartItem(item.merchandise.id, "minus")
                    }
                  >
                    −
                  </button>
                  <span className="qty-val">{item.quantity}</span>
                  <button
                    type="button"
                    className="qty-btn"
                    aria-label="Increase quantity"
                    onClick={() => updateCartItem(item.merchandise.id, "plus")}
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="cart-item-meta">
                <div className="cart-item-price">
                  {formatMoney(
                    item.cost.totalAmount.amount,
                    item.cost.totalAmount.currencyCode,
                  )}
                </div>
                <button
                  type="button"
                  className="cart-item-remove"
                  onClick={() =>
                    updateCartItem(item.merchandise.id, "delete")
                  }
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
            {empty ? "$0" : formatMoney(subtotalAmount, currencyCode)}
          </span>
        </div>
        <div className="cart-row">
          <span>Shipping</span>
          <span className="price">
            {shippingUnlocked ? "Free" : "Calculated at checkout"}
          </span>
        </div>
        <div className="cart-row total">
          <span>Total</span>
          <span className="price">
            {empty ? "$0" : formatMoney(subtotalAmount, currencyCode)}
          </span>
        </div>
        <div className="cart-shipping-note">
          Taxes calculated at checkout. Subscription orders renew at 25% off
          retail.
        </div>
        <a className="cart-checkout" href={empty ? "/shop" : checkoutUrl}>
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
        </a>
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
        }
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
      `}</style>
    </aside>
  );
}
