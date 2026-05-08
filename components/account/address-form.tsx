"use client";

// Address form — single shipping address (US-only).
//
// PATCH /api/account/addresses writes to Stripe Customer.shipping. Active
// subscriptions inherit Customer.shipping for renewal invoices, so no per-sub
// write is needed.

import { useState } from "react";
import { useRouter } from "next/navigation";

export type AddressFields = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  phone: string;
};

const US_STATES: Array<{ code: string; label: string }> = [
  { code: "AL", label: "Alabama" },
  { code: "AK", label: "Alaska" },
  { code: "AZ", label: "Arizona" },
  { code: "AR", label: "Arkansas" },
  { code: "CA", label: "California" },
  { code: "CO", label: "Colorado" },
  { code: "CT", label: "Connecticut" },
  { code: "DE", label: "Delaware" },
  { code: "DC", label: "District of Columbia" },
  { code: "FL", label: "Florida" },
  { code: "GA", label: "Georgia" },
  { code: "HI", label: "Hawaii" },
  { code: "ID", label: "Idaho" },
  { code: "IL", label: "Illinois" },
  { code: "IN", label: "Indiana" },
  { code: "IA", label: "Iowa" },
  { code: "KS", label: "Kansas" },
  { code: "KY", label: "Kentucky" },
  { code: "LA", label: "Louisiana" },
  { code: "ME", label: "Maine" },
  { code: "MD", label: "Maryland" },
  { code: "MA", label: "Massachusetts" },
  { code: "MI", label: "Michigan" },
  { code: "MN", label: "Minnesota" },
  { code: "MS", label: "Mississippi" },
  { code: "MO", label: "Missouri" },
  { code: "MT", label: "Montana" },
  { code: "NE", label: "Nebraska" },
  { code: "NV", label: "Nevada" },
  { code: "NH", label: "New Hampshire" },
  { code: "NJ", label: "New Jersey" },
  { code: "NM", label: "New Mexico" },
  { code: "NY", label: "New York" },
  { code: "NC", label: "North Carolina" },
  { code: "ND", label: "North Dakota" },
  { code: "OH", label: "Ohio" },
  { code: "OK", label: "Oklahoma" },
  { code: "OR", label: "Oregon" },
  { code: "PA", label: "Pennsylvania" },
  { code: "RI", label: "Rhode Island" },
  { code: "SC", label: "South Carolina" },
  { code: "SD", label: "South Dakota" },
  { code: "TN", label: "Tennessee" },
  { code: "TX", label: "Texas" },
  { code: "UT", label: "Utah" },
  { code: "VT", label: "Vermont" },
  { code: "VA", label: "Virginia" },
  { code: "WA", label: "Washington" },
  { code: "WV", label: "West Virginia" },
  { code: "WI", label: "Wisconsin" },
  { code: "WY", label: "Wyoming" },
];

export function AddressForm({
  initial,
}: {
  initial: AddressFields;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<AddressFields>(initial);
  const [status, setStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function update<K extends keyof AddressFields>(
    key: K,
    value: AddressFields[K],
  ) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "saving") return;
    setStatus("saving");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/account/addresses", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(body.message ?? `Save failed (${res.status})`);
      }
      setStatus("saved");
      router.refresh();
      setTimeout(() => setStatus("idle"), 2400);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={submit} className="addr-form">
      <div className="addr-section">
        <label className="addr-field">
          <span>Recipient name</span>
          <input
            type="text"
            autoComplete="shipping name"
            value={fields.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Full name"
            required
            maxLength={120}
            disabled={status === "saving"}
          />
        </label>

        <label className="addr-field">
          <span>Street address</span>
          <input
            type="text"
            autoComplete="shipping address-line1"
            value={fields.line1}
            onChange={(e) => update("line1", e.target.value)}
            placeholder="123 Main St"
            required
            maxLength={200}
            disabled={status === "saving"}
          />
        </label>

        <label className="addr-field">
          <span>Apartment, suite, etc. (optional)</span>
          <input
            type="text"
            autoComplete="shipping address-line2"
            value={fields.line2}
            onChange={(e) => update("line2", e.target.value)}
            placeholder="Apt 4B"
            maxLength={200}
            disabled={status === "saving"}
          />
        </label>

        <div className="addr-row-2">
          <label className="addr-field">
            <span>City</span>
            <input
              type="text"
              autoComplete="shipping address-level2"
              value={fields.city}
              onChange={(e) => update("city", e.target.value)}
              required
              maxLength={120}
              disabled={status === "saving"}
            />
          </label>
          <label className="addr-field">
            <span>State</span>
            <select
              autoComplete="shipping address-level1"
              value={fields.state}
              onChange={(e) => update("state", e.target.value)}
              required
              disabled={status === "saving"}
            >
              <option value="">Select state</option>
              {US_STATES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="addr-row-2">
          <label className="addr-field">
            <span>ZIP code</span>
            <input
              type="text"
              autoComplete="shipping postal-code"
              inputMode="numeric"
              pattern="[0-9]{5}(-[0-9]{4})?"
              value={fields.postalCode}
              onChange={(e) => update("postalCode", e.target.value)}
              required
              maxLength={10}
              placeholder="10001"
              disabled={status === "saving"}
            />
          </label>
          <label className="addr-field">
            <span>Country</span>
            <input
              type="text"
              value="United States"
              readOnly
              disabled
              className="addr-readonly"
            />
          </label>
        </div>

        <label className="addr-field">
          <span>Phone (optional)</span>
          <input
            type="tel"
            autoComplete="shipping tel"
            value={fields.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="For delivery questions only"
            maxLength={30}
            disabled={status === "saving"}
          />
        </label>
      </div>

      <div className="addr-actions">
        <button
          type="submit"
          className="addr-btn"
          disabled={status === "saving"}
        >
          {status === "saving" ? "Saving…" : "Save shipping address"}
        </button>
        {status === "saved" ? (
          <span className="addr-feedback ok">Saved.</span>
        ) : null}
        {status === "error" && errorMsg ? (
          <span className="addr-feedback err">{errorMsg}</span>
        ) : null}
      </div>

      <p className="addr-fineprint">
        Mujo ships from a US warehouse to US addresses only. Your shipping
        address is also used for sales-tax calculation. Updates apply to your
        next renewal — already-shipped boxes aren&rsquo;t affected.
      </p>

      <style>{`
        .addr-form {
          background: #fff;
          border: 1px solid rgba(26, 26, 26, 0.06);
          border-radius: 14px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        @media (min-width: 768px) {
          .addr-form { padding: 28px; }
        }
        .addr-section {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .addr-row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media (max-width: 600px) {
          .addr-row-2 { grid-template-columns: 1fr; }
        }
        .addr-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .addr-field span {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--mute);
          text-transform: uppercase;
        }
        .addr-field input,
        .addr-field select {
          padding: 12px 14px;
          font-family: inherit;
          font-size: 15px;
          background: var(--cream);
          border: 1px solid rgba(26, 26, 26, 0.09);
          border-radius: 10px;
          color: var(--ink);
          box-sizing: border-box;
          width: 100%;
        }
        .addr-field input:focus,
        .addr-field select:focus {
          outline: none;
          border-color: var(--orange);
        }
        .addr-readonly {
          background: var(--sand) !important;
          color: var(--ink-soft) !important;
          cursor: not-allowed;
        }
        .addr-actions {
          display: flex;
          align-items: center;
          gap: 14px;
          padding-top: 4px;
        }
        .addr-btn {
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
        .addr-btn:hover:not(:disabled) { background: var(--orange-deep); }
        .addr-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .addr-feedback {
          font-family: var(--f-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
        }
        .addr-feedback.ok { color: #4d6f4d; }
        .addr-feedback.err { color: #9b3d2c; }
        .addr-fineprint {
          font-size: 12px;
          color: var(--mute);
          line-height: 1.55;
          margin: 0;
        }
      `}</style>
    </form>
  );
}
