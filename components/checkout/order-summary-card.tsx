"use client";

import { useCart } from "components/cart/cart-context";
import {
  subtotalCents,
  effectiveShippingCents,
  freeShippingProgress,
} from "lib/cart/pricing";

function money(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
}

/**
 * Always-visible Mujo order summary rendered AROUND Stripe's sealed iframe.
 * It is the upfront cost-transparency layer (subtotal + shipping + free-ship
 * nudge + pre-tax total) — Baymard's #1 abandonment fix. The authoritative
 * final breakdown (live discount + exact tax) still lives inside Stripe's
 * in-iframe summary; this card never claims to be that. Shipping mirrors the
 * checkout routes: free when a subscription is present or subtotal >= $100.
 */
export function OrderSummaryCard() {
  const { cart, hydrated } = useCart();
  if (!hydrated || cart.items.length === 0) return null;

  const subtotal = subtotalCents(cart);
  const hasSub = cart.items.some((i) => i.isSubscription);
  const shipping = effectiveShippingCents(cart);
  const progress = freeShippingProgress(subtotal);
  const showNudge = !hasSub && !progress.unlocked;

  return (
    <aside className="checkout-summary" aria-label="Order summary">
      <h2 className="cs-title">Order summary</h2>

      <ul className="cs-items">
        {cart.items.map((item) => (
          <li key={item.stripePriceId} className="cs-item">
            <div className="cs-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.image.url} alt={item.image.alt} />
              <span className="cs-qty" aria-label={`Quantity ${item.quantity}`}>
                {item.quantity}
              </span>
            </div>
            <div className="cs-meta">
              <span className="cs-name">{item.productTitle}</span>
              {item.variantTitle ? (
                <span className="cs-variant">{item.variantTitle}</span>
              ) : null}
            </div>
            <span className="cs-line">
              {money(item.unitAmountCents * item.quantity)}
            </span>
          </li>
        ))}
      </ul>

      {showNudge ? (
        <p className="cs-nudge">
          Add {money(progress.remainingCents)} more to unlock free shipping.
        </p>
      ) : null}

      <dl className="cs-totals">
        <div className="cs-row">
          <dt>Subtotal</dt>
          <dd>{money(subtotal)}</dd>
        </div>
        <div className="cs-row">
          <dt>Shipping</dt>
          <dd>{shipping === 0 ? "FREE" : money(shipping)}</dd>
        </div>
        <div className="cs-row cs-muted">
          <dt>Taxes</dt>
          <dd>Calculated at checkout</dd>
        </div>
        <div className="cs-row cs-total">
          <dt>Total</dt>
          <dd>{money(subtotal + shipping)}</dd>
        </div>
      </dl>
      <p className="cs-foot">Tax is calculated at the payment step.</p>

      <style>{`
        .checkout-summary {
          background: #fff;
          border: 1px solid rgba(28, 26, 23, 0.08);
          border-radius: 14px;
          padding: 20px 18px;
          font-family: var(--f-body);
          color: var(--ink);
        }
        .cs-title {
          font-family: var(--f-display);
          font-size: 16px;
          font-weight: 500;
          margin: 0 0 14px;
          letter-spacing: -0.01em;
        }
        .cs-items { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
        .cs-item { display: grid; grid-template-columns: 48px 1fr auto; gap: 12px; align-items: center; }
        .cs-thumb { position: relative; width: 48px; height: 48px; }
        .cs-thumb img {
          width: 48px; height: 48px; object-fit: cover; border-radius: 8px;
          background: var(--cream); display: block;
        }
        .cs-qty {
          position: absolute; top: -8px; right: -8px; min-width: 18px; height: 18px;
          padding: 0 5px; border-radius: 999px; background: var(--ink); color: #fff;
          font-size: 11px; line-height: 18px; text-align: center; font-family: var(--f-mono);
        }
        .cs-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .cs-name { font-size: 13px; font-weight: 500; line-height: 1.25; }
        .cs-variant { font-size: 12px; color: var(--ink-soft); line-height: 1.2; }
        .cs-line { font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .cs-nudge {
          margin: 14px 0 0; padding: 8px 10px; border-radius: 8px;
          background: rgba(123, 142, 116, 0.14); color: var(--ink);
          font-size: 12px; line-height: 1.35;
        }
        .cs-totals { margin: 14px 0 0; padding: 14px 0 0; border-top: 1px solid rgba(28, 26, 23, 0.08); }
        .cs-row { display: flex; justify-content: space-between; align-items: baseline; margin: 0 0 8px; }
        .cs-row dt, .cs-row dd { margin: 0; font-size: 13px; }
        .cs-row dd { font-variant-numeric: tabular-nums; }
        .cs-muted dt, .cs-muted dd { color: var(--ink-soft); font-size: 12px; }
        .cs-total { margin: 10px 0 0; padding-top: 10px; border-top: 1px solid rgba(28, 26, 23, 0.08); }
        .cs-total dt, .cs-total dd { font-size: 15px; font-weight: 600; }
        .cs-foot { margin: 8px 0 0; font-size: 11px; color: var(--mute); font-family: var(--f-mono); letter-spacing: 0.02em; }
      `}</style>
    </aside>
  );
}
