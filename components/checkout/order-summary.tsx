"use client";

import { freeShippingProgress } from "lib/cart/pricing";
import { FREE_SHIPPING_THRESHOLD_CENTS } from "lib/stripe-constants";
import type { Cart } from "lib/cart/types";

type OrderSummaryProps = {
  cart: Cart;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number | null;
  totalCents: number;
  /** True while the address-blur tax recalc is in flight. */
  taxLoading?: boolean;
  /** True iff cart has any subscription line item. */
  hasSubscription: boolean;
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

export function OrderSummary({
  cart,
  subtotalCents,
  shippingCents,
  taxCents,
  totalCents,
  taxLoading,
  hasSubscription,
}: OrderSummaryProps) {
  const { remainingCents, unlocked } = freeShippingProgress(subtotalCents);

  return (
    <aside className="checkout-summary">
      <div className="summary-head">
        <h2>Your order</h2>
        <span className="summary-count">
          {cart.items.length === 1 ? "1 item" : `${cart.items.length} items`}
        </span>
      </div>

      <ul className="summary-items">
        {cart.items.map((item) => (
          <li key={item.stripePriceId} className="summary-item">
            <div className="summary-item-img">
              {item.image?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image.url} alt={item.image.alt} />
              ) : null}
              <span className="summary-item-qty">{item.quantity}</span>
            </div>
            <div className="summary-item-info">
              <div className="summary-item-name">{item.productTitle}</div>
              <div className="summary-item-variant">{item.variantTitle}</div>
            </div>
            <div className="summary-item-price">
              {formatMoneyCents(item.unitAmountCents * item.quantity)}
            </div>
          </li>
        ))}
      </ul>

      <div className="summary-rows">
        <div className="summary-row">
          <span>Subtotal</span>
          <span>{formatMoneyCents(subtotalCents)}</span>
        </div>
        <div className="summary-row">
          <span>Shipping</span>
          <span>
            {unlocked
              ? "Free"
              : shippingCents > 0
                ? formatMoneyCents(shippingCents)
                : "—"}
          </span>
        </div>
        {!unlocked && remainingCents > 0 ? (
          <div className="summary-shipping-hint">
            {formatMoneyCents(remainingCents)} away from free shipping
          </div>
        ) : null}
        <div className="summary-row">
          <span>Tax</span>
          <span>
            {taxLoading ? (
              <span className="summary-skeleton" aria-label="Calculating tax" />
            ) : taxCents !== null ? (
              formatMoneyCents(taxCents)
            ) : (
              "—"
            )}
          </span>
        </div>
        <div className="summary-row total">
          <span>Total</span>
          <span>{formatMoneyCents(totalCents)}</span>
        </div>
      </div>

      <ul className="summary-trust">
        <li>Secure checkout · Stripe</li>
        <li>30-day money-back guarantee</li>
        {hasSubscription ? <li>Cancel anytime</li> : null}
        <li>From our US warehouse</li>
      </ul>

      <div className="summary-edit">
        <a href="/shop">← Back to shop</a>
      </div>

      <style>{`
        .checkout-summary {
          background: var(--sand);
          border-radius: 14px;
          padding: 24px;
          font-family: var(--f-body);
          color: var(--ink);
          position: sticky;
          top: 24px;
        }
        .summary-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 18px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--line);
        }
        .summary-head h2 {
          font-family: var(--f-display);
          font-size: 18px;
          font-weight: 500;
          margin: 0;
        }
        .summary-count {
          font-family: var(--f-mono);
          font-size: 11px;
          color: var(--mute);
          letter-spacing: 0.1em;
        }
        .summary-items {
          list-style: none;
          padding: 0;
          margin: 0 0 18px;
        }
        .summary-item {
          display: grid;
          grid-template-columns: 56px 1fr auto;
          gap: 12px;
          padding: 10px 0;
          align-items: center;
        }
        .summary-item-img {
          position: relative;
          width: 56px;
          height: 56px;
          background: #fff;
          border-radius: 8px;
          overflow: hidden;
        }
        .summary-item-img img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .summary-item-qty {
          position: absolute;
          top: -8px;
          right: -8px;
          background: var(--ink);
          color: var(--cream);
          font-family: var(--f-mono);
          font-size: 11px;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .summary-item-name {
          font-size: 14px;
          font-weight: 500;
          line-height: 1.3;
          color: var(--ink);
        }
        .summary-item-variant {
          font-size: 12px;
          color: var(--mute);
          margin-top: 2px;
        }
        .summary-item-price {
          font-family: var(--f-mono);
          font-size: 13px;
          color: var(--ink);
        }
        .summary-rows {
          margin: 14px 0;
          padding: 14px 0;
          border-top: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 4px 0;
          font-size: 14px;
          color: var(--ink-soft);
        }
        .summary-row.total {
          padding-top: 10px;
          font-size: 18px;
          font-weight: 500;
          color: var(--ink);
          font-family: var(--f-display);
        }
        .summary-row span:last-child {
          font-family: var(--f-mono);
        }
        .summary-row.total span:last-child {
          font-family: var(--f-display);
        }
        .summary-shipping-hint {
          font-family: var(--f-mono);
          font-size: 11px;
          color: var(--orange-deep);
          letter-spacing: 0.04em;
          padding: 0 0 8px;
          margin-top: -4px;
        }
        .summary-skeleton {
          display: inline-block;
          width: 48px;
          height: 14px;
          background: linear-gradient(90deg, rgba(0,0,0,0.06), rgba(0,0,0,0.12), rgba(0,0,0,0.06));
          background-size: 200% 100%;
          border-radius: 4px;
          animation: summary-shimmer 1s linear infinite;
        }
        @keyframes summary-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .summary-trust {
          list-style: none;
          padding: 0;
          margin: 14px 0 0;
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--mute);
          display: grid;
          gap: 6px;
        }
        .summary-trust li::before {
          content: "✓";
          color: var(--sage);
          margin-right: 6px;
        }
        .summary-edit {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid var(--line);
        }
        .summary-edit a {
          font-family: var(--f-mono);
          font-size: 12px;
          color: var(--ink-soft);
          text-decoration: none;
        }
        .summary-edit a:hover { color: var(--orange-deep); }

        @media (max-width: 900px) {
          .checkout-summary {
            position: static;
            padding: 18px;
            border-radius: 12px;
          }
        }
      `}</style>
    </aside>
  );
}
