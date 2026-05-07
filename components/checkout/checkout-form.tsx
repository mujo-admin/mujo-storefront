"use client";

import {
  AddressElement,
  Elements,
  ExpressCheckoutElement,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import {
  loadStripe,
  type Stripe as StripeJs,
  type StripeAddressElementChangeEvent,
} from "@stripe/stripe-js";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "components/cart/cart-context";
import { OrderSummary } from "components/checkout/order-summary";
import {
  shippingCents as computeShippingCents,
  subtotalCents as computeSubtotalCents,
} from "lib/cart/pricing";

const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

const ECE_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_EXPRESS_CHECKOUT === "true";

let stripePromiseSingleton: Promise<StripeJs | null> | null = null;
function getStripePromise(): Promise<StripeJs | null> {
  if (!stripePromiseSingleton) {
    if (!PUBLISHABLE_KEY) {
      console.error(
        "[checkout] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set. Stripe Elements will not load.",
      );
      stripePromiseSingleton = Promise.resolve(null);
    } else {
      stripePromiseSingleton = loadStripe(PUBLISHABLE_KEY);
    }
  }
  return stripePromiseSingleton;
}

type CheckoutAddress = {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
};

type PaymentIntentResponse = {
  clientSecret: string;
  paymentIntentId: string;
  subscriptionId?: string;
  mode: "payment" | "subscription";
  eventId: string;
};

const ALLOWED_COUNTRIES: ["US"] = ["US"];

const APPEARANCE = {
  theme: "stripe" as const,
  variables: {
    colorPrimary: "#f2682f",
    colorBackground: "#fefcf5",
    colorText: "#1a1a1a",
    colorDanger: "#b91c1c",
    fontFamily:
      "'General Sans', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    spacingUnit: "4px",
    borderRadius: "10px",
  },
};

export function CheckoutForm() {
  return (
    <CheckoutSubforms />
  );
}

/**
 * Two-stage form: collect email + address (no Stripe Elements yet, so the
 * customer never sees a "Loading Stripe…" spinner before they've started).
 * Once address is present + we've fetched a PaymentIntent, mount <Elements />
 * with PaymentElement + ExpressCheckoutElement.
 */
function CheckoutSubforms() {
  const { cart, hydrated } = useCart();
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState<CheckoutAddress | null>(null);
  const [taxCents, setTaxCents] = useState<number | null>(null);
  const [taxCalculationId, setTaxCalculationId] = useState<string | null>(null);
  const [taxLoading, setTaxLoading] = useState(false);
  const [piResponse, setPiResponse] = useState<PaymentIntentResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = computeSubtotalCents(cart);
  const shipping = computeShippingCents(subtotal);
  const total = subtotal + shipping + (taxCents ?? 0);
  const hasSubscription = cart.items.some((i) => i.isSubscription);

  // Recalculate tax whenever the address fully resolves.
  useEffect(() => {
    if (!address) return;
    const items = cart.items;
    if (items.length === 0) return;

    let cancelled = false;
    setTaxLoading(true);

    fetch("/api/tax/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, shippingAddress: address }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`tax/calculate ${r.status}`);
        return r.json() as Promise<{
          taxCents: number;
          calculationId: string;
        }>;
      })
      .then((data) => {
        if (cancelled) return;
        setTaxCents(data.taxCents);
        setTaxCalculationId(data.calculationId);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[checkout] tax calc failed", err);
        setTaxCents(0);
        setTaxCalculationId(null);
      })
      .finally(() => {
        if (cancelled) return;
        setTaxLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, cart.items]);

  // Once we have email + address (+ tax), create the PaymentIntent.
  // Re-create when items change (so amount stays in sync). Stripe accepts
  // PI updates via paymentIntents.update if we wanted incremental, but
  // creating fresh on cart change is cheaper for the team.
  const itemsKey = useMemo(
    () =>
      cart.items
        .map((i) => `${i.stripePriceId}:${i.quantity}`)
        .sort()
        .join("|"),
    [cart.items],
  );

  useEffect(() => {
    if (!email || !address || taxLoading || taxCents === null) return;
    if (cart.items.length === 0) return;
    if (creating) return;

    let cancelled = false;
    setCreating(true);
    setError(null);

    fetch("/api/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.items.map((i) => ({
          stripePriceId: i.stripePriceId,
          quantity: i.quantity,
          isSubscription: i.isSubscription,
          unitAmountCents: i.unitAmountCents,
        })),
        customerEmail: email,
        shippingAddress: address,
        taxCalculationId: taxCalculationId ?? undefined,
        taxCents,
        shippingCents: shipping,
      }),
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) {
          throw new Error(body?.message || body?.error || `${r.status}`);
        }
        return body as PaymentIntentResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setPiResponse(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[checkout] payment-intent create failed", err);
        setError(
          err instanceof Error
            ? err.message
            : "Could not initialize payment. Please try again.",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setCreating(false);
      });

    return () => {
      cancelled = true;
    };
    // We intentionally key on itemsKey + email + address + tax shape; not
    // on `creating` (would recurse) or `piResponse` (would loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [email, address, taxCents, itemsKey, shipping]);

  if (!hydrated) {
    return <div className="checkout-loading">Loading your cart…</div>;
  }

  return (
    <div className="checkout-grid">
      <div className="checkout-col-form">
        <h1 className="checkout-h1">Checkout</h1>

        <section className="checkout-section">
          <label className="checkout-label" htmlFor="checkout-email">
            Email
          </label>
          <input
            id="checkout-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="checkout-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <p className="checkout-hint">
            Order updates land here. We'll never spam your inbox.
          </p>
        </section>

        <section className="checkout-section">
          <h2 className="checkout-h2">Shipping address</h2>
          <CheckoutAddressBlock onAddressReady={setAddress} />
        </section>

        {address && piResponse ? (
          <Elements
            stripe={getStripePromise()}
            options={{
              clientSecret: piResponse.clientSecret,
              appearance: APPEARANCE,
            }}
          >
            <PaymentSection
              eventId={piResponse.eventId}
              hasSubscription={hasSubscription}
            />
          </Elements>
        ) : (
          <section className="checkout-section">
            <h2 className="checkout-h2">Payment</h2>
            <div className="checkout-payment-placeholder">
              {creating ? (
                <span>Initializing secure payment…</span>
              ) : !email || !address ? (
                <span>Enter your email and address to continue.</span>
              ) : taxLoading ? (
                <span>Calculating tax…</span>
              ) : (
                <span>Preparing payment options…</span>
              )}
            </div>
          </section>
        )}

        {error ? <div className="checkout-error">{error}</div> : null}
      </div>

      <div className="checkout-col-summary">
        <OrderSummary
          cart={cart}
          subtotalCents={subtotal}
          shippingCents={shipping}
          taxCents={taxCents}
          totalCents={total}
          taxLoading={taxLoading}
          hasSubscription={hasSubscription}
        />
      </div>

      <CheckoutStyles />
    </div>
  );
}

function CheckoutAddressBlock({
  onAddressReady,
}: {
  onAddressReady: (address: CheckoutAddress | null) => void;
}) {
  // Address element lives outside <Elements /> until we have a clientSecret.
  // The cheap path: render a plain HTML form for shipping. When the customer
  // moves on (clicks "Continue to payment" implicit via blur), we fire the
  // address upward. Once <Elements /> mounts with PaymentIntent, AddressElement
  // gets used inside <PaymentSection /> — its onChange keeps Stripe + state aligned.

  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  // Push to parent when all required fields are filled.
  useEffect(() => {
    const complete = line1 && city && state && zip;
    if (!complete) {
      onAddressReady(null);
      return;
    }
    const id = setTimeout(() => {
      onAddressReady({
        line1: line1.trim(),
        line2: line2.trim() || null,
        city: city.trim(),
        state: state.trim().toUpperCase().slice(0, 2),
        postal_code: zip.trim(),
        country: "US",
      });
    }, 600);
    return () => clearTimeout(id);
  }, [line1, line2, city, state, zip, onAddressReady]);

  return (
    <div className="checkout-address">
      <input
        type="text"
        placeholder="Address"
        autoComplete="address-line1"
        value={line1}
        onChange={(e) => setLine1(e.target.value)}
        className="checkout-input"
        required
      />
      <input
        type="text"
        placeholder="Apt, suite, etc. (optional)"
        autoComplete="address-line2"
        value={line2}
        onChange={(e) => setLine2(e.target.value)}
        className="checkout-input"
      />
      <div className="checkout-address-row">
        <input
          type="text"
          placeholder="City"
          autoComplete="address-level2"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          className="checkout-input"
          required
        />
        <input
          type="text"
          placeholder="State"
          autoComplete="address-level1"
          maxLength={2}
          value={state}
          onChange={(e) => setState(e.target.value.toUpperCase())}
          className="checkout-input checkout-input-state"
          required
        />
        <input
          type="text"
          placeholder="ZIP"
          autoComplete="postal-code"
          inputMode="numeric"
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          className="checkout-input checkout-input-zip"
          required
        />
      </div>
      <p className="checkout-hint">US-only · Free shipping over $50</p>
    </div>
  );
}

function PaymentSection({
  eventId,
  hasSubscription,
}: {
  eventId: string;
  hasSubscription: boolean;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    setErrorMessage(null);

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success?event_id=${eventId}`,
      },
    });

    if (result.error) {
      setSubmitting(false);
      setErrorMessage(
        result.error.message ?? "Payment failed. Please try again.",
      );
    }
  }

  function onAddressChange(_ev: StripeAddressElementChangeEvent) {
    // Stripe's AddressElement is the source of truth for the shipping
    // address attached to the PaymentIntent. The plaintext block above
    // pre-populated tax + PI; this element captures any final changes.
    // No-op for Phase 2 — Phase 4 will wire saved-address pre-fill.
  }

  return (
    <form className="checkout-payment" onSubmit={onSubmit}>
      {ECE_ENABLED ? (
        <>
          <div className="checkout-ece">
            <ExpressCheckoutElement onConfirm={() => undefined} />
          </div>
          <div className="checkout-divider">or pay with card</div>
        </>
      ) : null}

      <h2 className="checkout-h2">Shipping</h2>
      <AddressElement
        options={{
          mode: "shipping",
          allowedCountries: [...ALLOWED_COUNTRIES],
          fields: { phone: "auto" },
          validation: { phone: { required: "auto" } },
        }}
        onChange={onAddressChange}
      />

      <h2 className="checkout-h2">Payment</h2>
      <PaymentElement options={{ layout: "accordion" }} />

      <button
        type="submit"
        className="checkout-pay-btn"
        disabled={!stripe || submitting}
      >
        {submitting ? "Processing…" : "Pay now"}
      </button>

      {errorMessage ? (
        <div className="checkout-error">{errorMessage}</div>
      ) : null}

      <p className="checkout-fineprint">
        {hasSubscription
          ? "By continuing, you authorize Mujo to charge your card today and on the same day every 4 weeks until you cancel. Cancel anytime from your account."
          : "By continuing, you authorize Mujo to charge your card for the items shown. Secured by Stripe."}
      </p>
    </form>
  );
}

function CheckoutStyles() {
  return (
    <style>{`
      .checkout-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr);
        gap: 32px;
        max-width: 1100px;
        margin: 0 auto;
        padding: 32px 24px 96px;
        font-family: var(--f-body);
        color: var(--ink);
      }
      .checkout-h1 {
        font-family: var(--f-display);
        font-size: 32px;
        font-weight: 500;
        letter-spacing: -0.01em;
        margin: 0 0 24px;
      }
      .checkout-h2 {
        font-family: var(--f-display);
        font-size: 16px;
        font-weight: 500;
        margin: 24px 0 12px;
      }
      .checkout-section {
        margin-bottom: 24px;
      }
      .checkout-label {
        display: block;
        font-family: var(--f-mono);
        font-size: 11px;
        letter-spacing: 0.08em;
        color: var(--mute);
        text-transform: uppercase;
        margin-bottom: 6px;
      }
      .checkout-input {
        width: 100%;
        padding: 13px 14px;
        font-family: inherit;
        font-size: 15px;
        background: var(--cream);
        border: 1px solid var(--line);
        border-radius: 10px;
        color: var(--ink);
        transition: border-color 0.15s;
      }
      .checkout-input:focus {
        outline: none;
        border-color: var(--orange);
        box-shadow: 0 0 0 3px rgba(242, 104, 47, 0.15);
      }
      .checkout-hint {
        font-family: var(--f-mono);
        font-size: 11px;
        color: var(--mute);
        letter-spacing: 0.04em;
        margin: 6px 0 0;
      }
      .checkout-address {
        display: grid;
        gap: 10px;
      }
      .checkout-address-row {
        display: grid;
        grid-template-columns: 1fr 80px 100px;
        gap: 10px;
      }
      .checkout-input-state {
        text-align: center;
      }
      .checkout-input-zip {
        text-align: center;
      }
      .checkout-payment {
        margin-top: 24px;
      }
      .checkout-payment-placeholder {
        background: var(--sand);
        padding: 20px;
        border-radius: 10px;
        font-size: 14px;
        color: var(--mute);
      }
      .checkout-ece {
        margin-bottom: 14px;
      }
      .checkout-divider {
        text-align: center;
        font-family: var(--f-mono);
        font-size: 11px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--mute);
        position: relative;
        margin: 18px 0;
      }
      .checkout-divider::before,
      .checkout-divider::after {
        content: "";
        position: absolute;
        top: 50%;
        width: calc(50% - 80px);
        height: 1px;
        background: var(--line);
      }
      .checkout-divider::before { left: 0; }
      .checkout-divider::after { right: 0; }
      .checkout-pay-btn {
        width: 100%;
        background: var(--orange);
        color: #fff;
        border: none;
        cursor: pointer;
        padding: 16px 24px;
        border-radius: 100px;
        font-family: var(--f-body);
        font-size: 15px;
        font-weight: 500;
        margin-top: 24px;
        transition: background 0.2s, opacity 0.2s;
      }
      .checkout-pay-btn:hover:not(:disabled) {
        background: var(--orange-deep);
      }
      .checkout-pay-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .checkout-error {
        margin-top: 14px;
        padding: 12px 14px;
        background: #fef2f2;
        border: 1px solid #fecaca;
        border-radius: 10px;
        color: #b91c1c;
        font-size: 14px;
      }
      .checkout-fineprint {
        font-size: 11px;
        color: var(--mute);
        font-family: var(--f-mono);
        letter-spacing: 0.04em;
        line-height: 1.5;
        margin-top: 16px;
      }
      .checkout-loading {
        max-width: 600px;
        margin: 60px auto;
        text-align: center;
        font-size: 15px;
        color: var(--mute);
      }
      @media (max-width: 900px) {
        .checkout-grid {
          grid-template-columns: 1fr;
          gap: 24px;
          padding: 18px 16px 64px;
        }
        .checkout-col-summary {
          order: -1;
        }
        .checkout-h1 { font-size: 26px; margin-bottom: 18px; }
        .checkout-address-row {
          grid-template-columns: 1fr 70px 90px;
        }
      }
    `}</style>
  );
}
