"use client";

import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJs } from "@stripe/stripe-js";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "components/cart/cart-context";

const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

let stripePromiseSingleton: Promise<StripeJs | null> | null = null;
function getStripePromise(): Promise<StripeJs | null> {
  if (!stripePromiseSingleton) {
    if (!PUBLISHABLE_KEY) {
      console.error(
        "[checkout] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set; <EmbeddedCheckout> will fail.",
      );
      stripePromiseSingleton = Promise.resolve(null);
    } else {
      stripePromiseSingleton = loadStripe(PUBLISHABLE_KEY);
    }
  }
  return stripePromiseSingleton;
}

/**
 * Stripe Embedded Checkout — Stripe-rendered checkout iframe pinned to
 * /checkout. Customer never sees stripe.com in the URL bar; the
 * <EmbeddedCheckout /> handles email + shipping address + payment + totals
 * + tax + 3DS internally. Cart line items get sent to /api/checkout-session
 * which mints a Session with ui_mode='embedded' and returns the
 * client_secret <EmbeddedCheckoutProvider> needs.
 */
export function EmbeddedCheckoutMount() {
  const { cart, hydrated, totalQuantity } = useCart();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Keyed off the line-item snapshot so cart edits before checkout fire a fresh
  // session. (After /checkout mounts, cart edits typically don't happen — but
  // direct /checkout deep-links should still produce a current session.)
  const itemsKey = useMemo(
    () =>
      cart.items
        .map((i) => `${i.stripePriceId}:${i.quantity}`)
        .sort()
        .join("|"),
    [cart.items],
  );

  useEffect(() => {
    if (!hydrated) return;
    if (cart.items.length === 0) return;
    if (creating) return;
    if (clientSecret) return; // Already minted.

    let cancelled = false;
    setCreating(true);
    setError(null);

    fetch("/api/checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.items.map((i) => ({
          stripePriceId: i.stripePriceId,
          quantity: i.quantity,
          isSubscription: i.isSubscription,
        })),
        origin: window.location.origin,
      }),
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body?.message || body?.error || `${r.status}`);
        return body as { clientSecret: string; sessionId: string };
      })
      .then((data) => {
        if (cancelled) return;
        setClientSecret(data.clientSecret);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[checkout] checkout-session create failed", err);
        setError(
          err instanceof Error
            ? err.message
            : "Could not initialize checkout. Please try again.",
        );
      })
      .finally(() => {
        if (!cancelled) setCreating(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, itemsKey]);

  if (!hydrated) {
    return <CheckoutShell><div className="checkout-loading">Loading your cart…</div></CheckoutShell>;
  }

  if (totalQuantity === 0) {
    return (
      <CheckoutShell>
        <div className="checkout-empty">
          <h1>Your cart is empty</h1>
          <p>Add a product before heading to checkout.</p>
          <a href="/shop" className="checkout-shop-link">
            Browse the shop →
          </a>
        </div>
      </CheckoutShell>
    );
  }

  if (error) {
    return (
      <CheckoutShell>
        <div className="checkout-error-card">
          <h1>Couldn't start checkout</h1>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setClientSecret(null);
            }}
            className="checkout-retry-btn"
          >
            Try again
          </button>
        </div>
      </CheckoutShell>
    );
  }

  if (!clientSecret) {
    return (
      <CheckoutShell>
        <div className="checkout-loading">Initializing secure checkout…</div>
      </CheckoutShell>
    );
  }

  return (
    <CheckoutShell>
      <EmbeddedCheckoutProvider
        stripe={getStripePromise()}
        options={{ clientSecret }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </CheckoutShell>
  );
}

function CheckoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="checkout-shell">
      <header className="checkout-header">
        <h1 className="checkout-title">Checkout</h1>
        <a href="/shop" className="checkout-back">← Back to shop</a>
      </header>
      <div className="checkout-frame">{children}</div>
      <ul className="checkout-trust">
        <li>Secure checkout · Stripe</li>
        <li>30-day money-back guarantee</li>
        <li>From our US warehouse</li>
      </ul>

      <style>{`
        .checkout-shell {
          max-width: 720px;
          margin: 0 auto;
          padding: 24px 20px 80px;
          font-family: var(--f-body);
          color: var(--ink);
        }
        .checkout-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 22px;
        }
        .checkout-title {
          font-family: var(--f-display);
          font-size: 28px;
          font-weight: 500;
          letter-spacing: -0.01em;
          margin: 0;
        }
        .checkout-back {
          font-family: var(--f-mono);
          font-size: 12px;
          color: var(--ink-soft);
          text-decoration: none;
          letter-spacing: 0.04em;
        }
        .checkout-back:hover { color: var(--orange-deep); }
        .checkout-frame {
          background: var(--cream);
          border-radius: 14px;
          min-height: 480px;
        }
        .checkout-loading,
        .checkout-empty,
        .checkout-error-card {
          padding: 48px 28px;
          text-align: center;
          font-size: 15px;
          color: var(--ink-soft);
        }
        .checkout-empty h1,
        .checkout-error-card h1 {
          font-family: var(--f-display);
          font-size: 22px;
          color: var(--ink);
          margin: 0 0 10px;
        }
        .checkout-empty p,
        .checkout-error-card p {
          margin: 0 0 18px;
          font-size: 14px;
        }
        .checkout-shop-link {
          display: inline-block;
          background: var(--orange);
          color: #fff;
          text-decoration: none;
          padding: 12px 22px;
          border-radius: 100px;
          font-size: 14px;
          font-weight: 500;
        }
        .checkout-shop-link:hover { background: var(--orange-deep); }
        .checkout-retry-btn {
          background: var(--orange);
          color: #fff;
          border: none;
          cursor: pointer;
          padding: 12px 22px;
          border-radius: 100px;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
        }
        .checkout-retry-btn:hover { background: var(--orange-deep); }
        .checkout-trust {
          list-style: none;
          padding: 0;
          margin: 22px 0 0;
          display: flex;
          gap: 24px;
          justify-content: center;
          flex-wrap: wrap;
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--mute);
        }
        .checkout-trust li::before {
          content: "✓";
          color: var(--sage);
          margin-right: 6px;
        }
        @media (max-width: 600px) {
          .checkout-shell { padding: 16px 12px 56px; }
          .checkout-title { font-size: 22px; }
          .checkout-trust { gap: 12px; font-size: 10px; }
        }
      `}</style>
    </div>
  );
}
