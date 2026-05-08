"use client";

// 2-step "Send one as a gift" modal.
// Step 1: gift recipient address + optional gift message.
// Step 2: confirmation (recipient · address · charge amount → "Send gift").
//
// On confirm: POSTs /api/account/subscription/send-gift, which creates an
// off-session PaymentIntent against the customer's saved card with the gift
// shipping address as override. The existing payment_intent.succeeded webhook
// already reads pi.shipping for Shopify order creation, so the Shopify order
// gets the gift address automatically — no handler changes needed.

import { useEffect, useState } from "react";

const US_STATES: Array<{ code: string; label: string }> = [
  { code: "AL", label: "Alabama" }, { code: "AK", label: "Alaska" },
  { code: "AZ", label: "Arizona" }, { code: "AR", label: "Arkansas" },
  { code: "CA", label: "California" }, { code: "CO", label: "Colorado" },
  { code: "CT", label: "Connecticut" }, { code: "DE", label: "Delaware" },
  { code: "DC", label: "District of Columbia" }, { code: "FL", label: "Florida" },
  { code: "GA", label: "Georgia" }, { code: "HI", label: "Hawaii" },
  { code: "ID", label: "Idaho" }, { code: "IL", label: "Illinois" },
  { code: "IN", label: "Indiana" }, { code: "IA", label: "Iowa" },
  { code: "KS", label: "Kansas" }, { code: "KY", label: "Kentucky" },
  { code: "LA", label: "Louisiana" }, { code: "ME", label: "Maine" },
  { code: "MD", label: "Maryland" }, { code: "MA", label: "Massachusetts" },
  { code: "MI", label: "Michigan" }, { code: "MN", label: "Minnesota" },
  { code: "MS", label: "Mississippi" }, { code: "MO", label: "Missouri" },
  { code: "MT", label: "Montana" }, { code: "NE", label: "Nebraska" },
  { code: "NV", label: "Nevada" }, { code: "NH", label: "New Hampshire" },
  { code: "NJ", label: "New Jersey" }, { code: "NM", label: "New Mexico" },
  { code: "NY", label: "New York" }, { code: "NC", label: "North Carolina" },
  { code: "ND", label: "North Dakota" }, { code: "OH", label: "Ohio" },
  { code: "OK", label: "Oklahoma" }, { code: "OR", label: "Oregon" },
  { code: "PA", label: "Pennsylvania" }, { code: "RI", label: "Rhode Island" },
  { code: "SC", label: "South Carolina" }, { code: "SD", label: "South Dakota" },
  { code: "TN", label: "Tennessee" }, { code: "TX", label: "Texas" },
  { code: "UT", label: "Utah" }, { code: "VT", label: "Vermont" },
  { code: "VA", label: "Virginia" }, { code: "WA", label: "Washington" },
  { code: "WV", label: "West Virginia" }, { code: "WI", label: "Wisconsin" },
  { code: "WY", label: "Wyoming" },
];

type Step = 1 | 2;

export type GiftFormFields = {
  recipientName: string;
  recipientEmail: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  giftMessage: string;
};

function emptyFields(senderEmail: string): GiftFormFields {
  return {
    recipientName: "",
    recipientEmail: senderEmail, // pre-fill with sender's email — most common
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    giftMessage: "",
  };
}

export function GiftModal({
  productLabel,
  effectiveAmountCents,
  currency,
  senderEmail,
  onClose,
  onSuccess,
}: {
  productLabel: string;
  /** Effective per-delivery price (post-coupon) — what we'll charge. */
  effectiveAmountCents: number;
  currency: string;
  /** Customer's email — pre-fills the recipient-email field. */
  senderEmail: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<Step>(1);
  const [fields, setFields] = useState<GiftFormFields>(() =>
    emptyFields(senderEmail),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function update<K extends keyof GiftFormFields>(
    key: K,
    value: GiftFormFields[K],
  ) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  // Body scroll lock + Escape close.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, pending]);

  function step1Valid(): boolean {
    return Boolean(
      fields.recipientName.trim() &&
        // Lightweight email shape check — full validation happens server-side.
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.recipientEmail.trim()) &&
        fields.line1.trim() &&
        fields.city.trim() &&
        fields.state &&
        /^\d{5}(-\d{4})?$/.test(fields.postalCode.trim()),
    );
  }

  async function submit() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/account/subscription/send-gift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippingAddress: {
            recipientName: fields.recipientName.trim(),
            line1: fields.line1.trim(),
            line2: fields.line2.trim() || undefined,
            city: fields.city.trim(),
            state: fields.state.toUpperCase(),
            postalCode: fields.postalCode.trim(),
          },
          recipientEmail: fields.recipientEmail.trim().toLowerCase(),
          giftMessage: fields.giftMessage.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `Request failed (${res.status})`);
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  function handleSuccessClose() {
    onSuccess();
    onClose();
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-card gift-modal">
        {!pending ? (
          <button
            type="button"
            aria-label="Close"
            className="modal-close"
            onClick={onClose}
          >
            ×
          </button>
        ) : null}

        {done ? (
          <>
            <h3 className="modal-title">
              Gift on its <em>way.</em>
            </h3>
            <p className="modal-body-text">
              We charged your saved card and the box ships from our US warehouse
              shortly. The Stripe receipt goes to{" "}
              <strong>{senderEmail}</strong>; shipping confirmation and tracking
              go to <strong>{fields.recipientEmail}</strong>.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn-primary"
                onClick={handleSuccessClose}
              >
                Done
              </button>
            </div>
          </>
        ) : step === 1 ? (
          <>
            <h3 className="modal-title">
              Send one as a <em>gift.</em>
            </h3>
            <p className="modal-body-text">
              We&rsquo;ll ship a one-time box to your friend at your subscriber
              rate. Charge goes to your saved card on confirm — your own
              subscription stays on its normal schedule.
            </p>

            <div className="gift-fields">
              <label className="gift-field">
                <span>Recipient name</span>
                <input
                  type="text"
                  value={fields.recipientName}
                  onChange={(e) => update("recipientName", e.target.value)}
                  placeholder="Full name"
                  required
                  maxLength={120}
                />
              </label>

              <label className="gift-field">
                <span>Email for tracking updates</span>
                <input
                  type="email"
                  inputMode="email"
                  value={fields.recipientEmail}
                  onChange={(e) => update("recipientEmail", e.target.value)}
                  placeholder="recipient@example.com"
                  required
                  maxLength={200}
                />
                <span className="gift-field-hint">
                  Where shipping confirmation + tracking number land. Use the
                  recipient&rsquo;s email so they get notified, or your own
                  if you want to forward it.
                </span>
              </label>

              <label className="gift-field">
                <span>Street address</span>
                <input
                  type="text"
                  value={fields.line1}
                  onChange={(e) => update("line1", e.target.value)}
                  placeholder="123 Main St"
                  required
                  maxLength={200}
                />
              </label>

              <label className="gift-field">
                <span>Apt, suite (optional)</span>
                <input
                  type="text"
                  value={fields.line2}
                  onChange={(e) => update("line2", e.target.value)}
                  placeholder="Apt 4B"
                  maxLength={200}
                />
              </label>

              <div className="gift-row-2">
                <label className="gift-field">
                  <span>City</span>
                  <input
                    type="text"
                    value={fields.city}
                    onChange={(e) => update("city", e.target.value)}
                    required
                    maxLength={120}
                  />
                </label>
                <label className="gift-field">
                  <span>State</span>
                  <select
                    value={fields.state}
                    onChange={(e) => update("state", e.target.value)}
                    required
                  >
                    <option value="">Select</option>
                    {US_STATES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="gift-field">
                <span>ZIP code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={fields.postalCode}
                  onChange={(e) => update("postalCode", e.target.value)}
                  required
                  maxLength={10}
                  placeholder="10001"
                />
              </label>

              <label className="gift-field">
                <span>Gift message (optional, 250 chars)</span>
                <textarea
                  value={fields.giftMessage}
                  onChange={(e) => update("giftMessage", e.target.value)}
                  rows={3}
                  maxLength={250}
                  placeholder="Optional — we'll include this on a card."
                />
              </label>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn-secondary"
                onClick={onClose}
              >
                Never mind
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-primary"
                disabled={!step1Valid()}
                onClick={() => setStep(2)}
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="modal-title">
              Confirm <em>and send.</em>
            </h3>
            <p className="modal-body-text">
              Sending <strong>{productLabel}</strong> to:
            </p>

            <div className="gift-summary">
              <div className="gift-summary-line gift-summary-name">
                {fields.recipientName}
              </div>
              <div className="gift-summary-line">{fields.line1}</div>
              {fields.line2 ? (
                <div className="gift-summary-line">{fields.line2}</div>
              ) : null}
              <div className="gift-summary-line">
                {fields.city}, {fields.state} {fields.postalCode}
              </div>
              <div className="gift-summary-divider" />
              <div className="gift-summary-meta-row">
                <span className="gift-summary-meta-label">
                  Tracking emails to
                </span>
                <span className="gift-summary-meta-val">
                  {fields.recipientEmail}
                </span>
              </div>
              {fields.giftMessage ? (
                <>
                  <div className="gift-summary-divider" />
                  <div className="gift-summary-message-label">Gift message</div>
                  <div className="gift-summary-message">
                    "{fields.giftMessage}"
                  </div>
                </>
              ) : null}
              <div className="gift-summary-divider" />
              <div className="gift-summary-charge-row">
                <span>Charge today</span>
                <strong>{formatCents(effectiveAmountCents, currency)}</strong>
              </div>
              <div className="gift-summary-fineprint">
                + tax · billed to your saved card · ships from our US warehouse
              </div>
            </div>

            {error ? <p className="modal-error">{error}</p> : null}

            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn-secondary"
                onClick={() => setStep(1)}
                disabled={pending}
              >
                ← Back
              </button>
              <button
                type="button"
                className="modal-btn modal-btn-primary"
                onClick={submit}
                disabled={pending}
              >
                {pending ? "Sending…" : "Send gift"}
              </button>
            </div>
          </>
        )}
      </div>

      <style>{`
        .gift-modal {
          max-width: 520px;
        }
        .gift-fields {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 18px;
        }
        .gift-row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        @media (max-width: 480px) {
          .gift-row-2 { grid-template-columns: 1fr; }
        }
        .gift-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .gift-field > span:not(.gift-field-hint) {
          font-family: var(--f-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--mute);
          text-transform: uppercase;
        }
        .gift-field-hint {
          font-size: 11px;
          color: var(--mute);
          line-height: 1.45;
          letter-spacing: normal;
          text-transform: none;
          font-family: var(--f-body);
          margin-top: 2px;
        }
        .gift-field input,
        .gift-field select,
        .gift-field textarea {
          padding: 10px 12px;
          font-family: inherit;
          font-size: 14px;
          background: #fff;
          border: 1px solid rgba(26, 26, 26, 0.09);
          border-radius: 10px;
          color: var(--ink);
          box-sizing: border-box;
          width: 100%;
        }
        .gift-field input:focus,
        .gift-field select:focus,
        .gift-field textarea:focus {
          outline: none;
          border-color: var(--orange);
        }
        .gift-field textarea {
          resize: vertical;
          font-family: inherit;
        }

        .gift-summary {
          background: #fff;
          border: 1px solid rgba(26, 26, 26, 0.09);
          border-radius: 12px;
          padding: 18px;
          margin-bottom: 18px;
        }
        .gift-summary-line {
          font-size: 14px;
          color: var(--ink);
          line-height: 1.45;
        }
        .gift-summary-name {
          font-weight: 500;
          margin-bottom: 4px;
        }
        .gift-summary-divider {
          height: 1px;
          background: rgba(26, 26, 26, 0.06);
          margin: 12px -18px;
        }
        .gift-summary-meta-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
        }
        .gift-summary-meta-label {
          font-family: var(--f-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--mute);
          text-transform: uppercase;
        }
        .gift-summary-meta-val {
          font-size: 13px;
          color: var(--ink);
          word-break: break-all;
          text-align: right;
        }
        .gift-summary-message-label {
          font-family: var(--f-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--mute);
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .gift-summary-message {
          font-family: var(--f-serif);
          font-style: italic;
          font-size: 15px;
          color: var(--ink);
          line-height: 1.45;
        }
        .gift-summary-charge-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 14px;
          color: var(--ink);
        }
        .gift-summary-charge-row strong {
          font-family: var(--f-mono);
          font-weight: 500;
          font-variant-numeric: tabular-nums;
        }
        .gift-summary-fineprint {
          font-size: 11px;
          color: var(--mute);
          margin-top: 6px;
          font-family: var(--f-mono);
          letter-spacing: 0.04em;
        }
      `}</style>
    </div>
  );
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
