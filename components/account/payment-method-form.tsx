"use client";

// PaymentMethodForm — current card display + "Update card" CTA that mounts
// Stripe Elements PaymentElement (lazy) inside a SetupIntent flow.
//
// Flow:
//   1. Display current default card (brand · last4 · expiry)
//   2. Click "Update card" → POST /api/account/payment-method to mint a
//      SetupIntent client_secret
//   3. <Elements /> mounts, customer enters new card, confirmSetup()
//   4. On success → PATCH /api/account/payment-method with the new PM ID
//      to promote it to default + propagate to active subs
//   5. Server route redirects to /account/payment-method?updated=1
//
// Uses the same loadStripe singleton pattern as embedded-checkout.tsx so
// stripe.js loads once per session.

import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import {
  loadStripe,
  type Stripe as StripeJs,
  type StripeElementsOptions,
} from "@stripe/stripe-js";
import { useState } from "react";
import { useRouter } from "next/navigation";

const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

let stripePromiseSingleton: Promise<StripeJs | null> | null = null;
function getStripePromise(): Promise<StripeJs | null> {
  if (!stripePromiseSingleton) {
    if (!PUBLISHABLE_KEY) {
      console.error(
        "[payment-method] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not set",
      );
      stripePromiseSingleton = Promise.resolve(null);
    } else {
      stripePromiseSingleton = loadStripe(PUBLISHABLE_KEY);
    }
  }
  return stripePromiseSingleton;
}

export type CurrentCard = {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
};

const ELEMENT_APPEARANCE: StripeElementsOptions["appearance"] = {
  theme: "stripe",
  variables: {
    colorPrimary: "#f2682f",
    colorBackground: "#f3f2e9",
    colorText: "#0f0f0f",
    colorTextSecondary: "#666",
    colorTextPlaceholder: "#999",
    colorDanger: "#9b3d2c",
    fontFamily:
      '"General Sans", system-ui, sans-serif',
    spacingUnit: "4px",
    borderRadius: "10px",
  },
};

export function PaymentMethodForm({
  currentCard,
}: {
  currentCard: CurrentCard | null;
}) {
  const [editing, setEditing] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startEdit() {
    setEditing(true);
    setError(null);
    if (clientSecret) return; // Already minted — reuse.
    setCreating(true);
    try {
      const res = await fetch("/api/account/payment-method", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(body.message ?? "Could not start update.");
      }
      const data = (await res.json()) as { clientSecret: string };
      setClientSecret(data.clientSecret);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setEditing(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="pm-form">
      {/* Current card */}
      {currentCard ? (
        <div className="pm-current">
          <div className="pm-current-row">
            <span className="pm-eyebrow">On file</span>
            <span className="pm-card">
              {formatBrand(currentCard.brand)} ending {currentCard.last4}
            </span>
          </div>
          <div className="pm-current-row">
            <span className="pm-eyebrow">Expires</span>
            <span className="pm-card">
              {String(currentCard.expMonth).padStart(2, "0")}/
              {String(currentCard.expYear).slice(-2)}
            </span>
          </div>
        </div>
      ) : (
        <div className="pm-current">
          <p className="pm-current-empty">
            No card on file yet. Add one to enable subscription auto-renewal
            and faster checkout.
          </p>
        </div>
      )}

      {!editing ? (
        <button
          type="button"
          className="pm-btn"
          onClick={startEdit}
          disabled={creating}
        >
          {creating
            ? "Loading…"
            : currentCard
              ? "Update card"
              : "Add a card"}
        </button>
      ) : null}

      {error ? <p className="pm-error">{error}</p> : null}

      {editing && clientSecret ? (
        <Elements
          stripe={getStripePromise()}
          options={{
            clientSecret,
            appearance: ELEMENT_APPEARANCE,
          }}
        >
          <UpdateCardInner
            onCancel={() => {
              setEditing(false);
              setClientSecret(null);
            }}
          />
        </Elements>
      ) : null}

      <ul className="pm-trust">
        <li>Secure · Stripe</li>
        <li>3D Secure supported</li>
        <li>Card details never touch Mujo servers</li>
      </ul>

      <style>{`
        .pm-form { display: flex; flex-direction: column; gap: 18px; }
        .pm-current {
          background: var(--cream);
          border-radius: 14px;
          padding: 22px 22px 6px;
        }
        .pm-current-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid var(--line);
        }
        .pm-current-row:last-child { border-bottom: none; }
        .pm-eyebrow {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--mute);
          text-transform: uppercase;
        }
        .pm-card {
          font-size: 14px;
          color: var(--ink);
          font-variant-numeric: tabular-nums;
        }
        .pm-current-empty {
          font-size: 14px;
          color: var(--ink-soft);
          line-height: 1.55;
          margin: 8px 0;
        }
        .pm-btn {
          align-self: flex-start;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          background: var(--orange);
          color: #fff;
          border: none;
          padding: 12px 22px;
          border-radius: 100px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .pm-btn:hover:not(:disabled) { background: var(--orange-deep); }
        .pm-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .pm-error {
          font-size: 13px;
          color: #9b3d2c;
          margin: 0;
        }
        .pm-trust {
          list-style: none;
          padding: 0;
          margin: 8px 0 0;
          display: flex;
          flex-wrap: wrap;
          gap: 18px;
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--mute);
        }
        .pm-trust li::before {
          content: "✓";
          color: var(--sage, #7CA77C);
          margin-right: 6px;
        }
      `}</style>
    </div>
  );
}

function UpdateCardInner({ onCancel }: { onCancel: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? "Please check the card details.");
        setSubmitting(false);
        return;
      }

      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
        confirmParams: {
          return_url: `${window.location.origin}/account/payment-method?updated=1`,
        },
      });

      if (confirmError) {
        setError(confirmError.message ?? "Could not save the card.");
        setSubmitting(false);
        return;
      }

      // No redirect required — promote PM to default server-side, then refresh.
      if (setupIntent?.status === "succeeded") {
        const pmId =
          typeof setupIntent.payment_method === "string"
            ? setupIntent.payment_method
            : setupIntent.payment_method?.id;
        if (!pmId) {
          setError("Stripe did not return a payment method.");
          setSubmitting(false);
          return;
        }
        const res = await fetch("/api/account/payment-method", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentMethodId: pmId }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            message?: string;
          };
          setError(body.message ?? "Could not set as default.");
          setSubmitting(false);
          return;
        }
        // Hard navigate so the server-side card-on-file fetch re-runs.
        window.location.assign("/account/payment-method?updated=1");
      } else {
        setError(
          `Setup ${setupIntent?.status ?? "incomplete"} — please try again.`,
        );
        setSubmitting(false);
      }
    } catch (err) {
      console.error("[payment-method] submit error", err);
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="pm-update">
      <div className="pm-update-card">
        <PaymentElement
          options={{
            layout: { type: "accordion", defaultCollapsed: false },
          }}
        />
      </div>

      {error ? <p className="pm-update-error">{error}</p> : null}

      <div className="pm-update-actions">
        <button
          type="button"
          className="pm-update-cancel"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="pm-update-submit"
          disabled={!stripe || !elements || submitting}
        >
          {submitting ? "Saving…" : "Save card"}
        </button>
      </div>

      <style>{`
        .pm-update {
          background: var(--cream);
          border-radius: 14px;
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .pm-update-card {
          background: var(--sand);
          border-radius: 12px;
          padding: 16px;
        }
        .pm-update-error {
          font-size: 13px;
          color: #9b3d2c;
          margin: 0;
        }
        .pm-update-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
        .pm-update-cancel,
        .pm-update-submit {
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          padding: 12px 22px;
          border-radius: 100px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .pm-update-cancel {
          background: transparent;
          color: var(--ink-soft);
          border-color: var(--line);
        }
        .pm-update-cancel:hover:not(:disabled) {
          border-color: var(--ink);
          color: var(--ink);
        }
        .pm-update-submit { background: var(--orange); color: #fff; }
        .pm-update-submit:hover:not(:disabled) { background: var(--orange-deep); }
        .pm-update-submit:disabled,
        .pm-update-cancel:disabled { opacity: 0.5; cursor: not-allowed; }
      `}</style>
    </form>
  );
}

function formatBrand(brand: string): string {
  if (!brand) return "Card";
  const lower = brand.toLowerCase();
  if (lower === "amex") return "American Express";
  if (lower === "mastercard") return "Mastercard";
  if (lower === "visa") return "Visa";
  if (lower === "discover") return "Discover";
  if (lower === "diners") return "Diners";
  if (lower === "jcb") return "JCB";
  if (lower === "unionpay") return "UnionPay";
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}
