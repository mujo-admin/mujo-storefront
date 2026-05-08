"use client";

// Profile form — three independently-saved sections:
//   1. Name (first + last)         → PATCH /api/account/profile
//   2. Email-marketing toggle       → PATCH /api/account/profile
//   3. Email change                 → POST /api/account/profile/email
//
// Email change uses a separate flow because it requires verification of the
// new address before commit. The form shows a "verification email sent"
// state on POST and the customer must click the link to complete the change.

import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "idle" | "saving" | "saved" | "error";

export function ProfileForm({
  initialFirstName,
  initialLastName,
  initialEmail,
  initialMarketingConsent,
}: {
  initialFirstName: string;
  initialLastName: string;
  initialEmail: string;
  initialMarketingConsent: "subscribed" | "unsubscribed";
}) {
  const router = useRouter();

  // Section 1: name
  const [firstName, setFirstName] = useState(initialFirstName);
  const [lastName, setLastName] = useState(initialLastName);
  const [nameStatus, setNameStatus] = useState<Status>("idle");

  // Section 2: marketing toggle
  const [marketingConsent, setMarketingConsent] = useState<
    "subscribed" | "unsubscribed"
  >(initialMarketingConsent);
  const [consentStatus, setConsentStatus] = useState<Status>("idle");

  // Section 3: email change
  const [newEmail, setNewEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<
    "idle" | "saving" | "sent" | "error"
  >("idle");
  const [emailError, setEmailError] = useState<string | null>(null);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (nameStatus === "saving") return;
    setNameStatus("saving");
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setNameStatus("saved");
      router.refresh();
      setTimeout(() => setNameStatus("idle"), 2400);
    } catch {
      setNameStatus("error");
    }
  }

  async function saveConsent(value: "subscribed" | "unsubscribed") {
    setMarketingConsent(value);
    setConsentStatus("saving");
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketingConsent: value }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      setConsentStatus("saved");
      setTimeout(() => setConsentStatus("idle"), 2400);
    } catch {
      setConsentStatus("error");
      // Roll back the toggle on error.
      setMarketingConsent(value === "subscribed" ? "unsubscribed" : "subscribed");
    }
  }

  async function sendEmailChange(e: React.FormEvent) {
    e.preventDefault();
    if (emailStatus === "saving") return;
    if (!newEmail || newEmail === initialEmail) return;
    setEmailStatus("saving");
    setEmailError(null);
    try {
      const res = await fetch("/api/account/profile/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEmail }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(body.message ?? "Could not send confirmation email.");
      }
      setEmailStatus("sent");
    } catch (err) {
      setEmailError(
        err instanceof Error ? err.message : "Something went wrong.",
      );
      setEmailStatus("error");
    }
  }

  return (
    <div className="profile-form">
      {/* Name */}
      <form onSubmit={saveName} className="profile-section">
        <h2 className="profile-section-title">Name</h2>
        <div className="profile-row-2">
          <label className="profile-field">
            <span>First name</span>
            <input
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={100}
              disabled={nameStatus === "saving"}
            />
          </label>
          <label className="profile-field">
            <span>Last name</span>
            <input
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={100}
              disabled={nameStatus === "saving"}
            />
          </label>
        </div>
        <div className="profile-section-actions">
          <button
            type="submit"
            className="profile-btn"
            disabled={nameStatus === "saving"}
          >
            {nameStatus === "saving" ? "Saving…" : "Save name"}
          </button>
          {nameStatus === "saved" ? (
            <span className="profile-feedback ok">Saved.</span>
          ) : null}
          {nameStatus === "error" ? (
            <span className="profile-feedback err">
              Could not save. Try again.
            </span>
          ) : null}
        </div>
      </form>

      <hr className="profile-hr" />

      {/* Marketing consent */}
      <div className="profile-section">
        <h2 className="profile-section-title">Email preferences</h2>
        <p className="profile-help">
          Subscribe to marketing emails — new product launches, behind-the-scenes
          notes, and the occasional Rebel Notebook entry. Transactional emails
          (orders, subscription updates) always arrive regardless.
        </p>
        <label className="profile-toggle">
          <input
            type="checkbox"
            checked={marketingConsent === "subscribed"}
            disabled={consentStatus === "saving"}
            onChange={(e) =>
              saveConsent(e.target.checked ? "subscribed" : "unsubscribed")
            }
          />
          <span className="profile-toggle-track">
            <span className="profile-toggle-knob" />
          </span>
          <span className="profile-toggle-label">
            {marketingConsent === "subscribed"
              ? "Subscribed to marketing emails"
              : "Unsubscribed from marketing emails"}
          </span>
        </label>
        {consentStatus === "saved" ? (
          <span className="profile-feedback ok">Updated.</span>
        ) : null}
        {consentStatus === "error" ? (
          <span className="profile-feedback err">
            Could not update — try again.
          </span>
        ) : null}
      </div>

      <hr className="profile-hr" />

      {/* Email change */}
      <form onSubmit={sendEmailChange} className="profile-section">
        <h2 className="profile-section-title">Email address</h2>
        <p className="profile-help">
          Your sign-in and order receipts go here. Changing it requires
          confirming the new address.
        </p>
        <div className="profile-field">
          <span className="profile-field-label">Current</span>
          <input
            type="email"
            value={initialEmail}
            readOnly
            disabled
            className="profile-readonly"
          />
        </div>

        {emailStatus === "sent" ? (
          <div className="profile-success-card">
            <strong>Verification email sent</strong>
            <p>
              Check <strong>{newEmail}</strong> for a confirmation link. Click
              it within 24 hours to complete the change. Until then, your
              account email stays {initialEmail}.
            </p>
          </div>
        ) : (
          <>
            <label className="profile-field">
              <span>New email</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="new-email@example.com"
                disabled={emailStatus === "saving"}
              />
            </label>
            {emailError ? (
              <p className="profile-feedback err">{emailError}</p>
            ) : null}
            <div className="profile-section-actions">
              <button
                type="submit"
                className="profile-btn"
                disabled={
                  emailStatus === "saving" ||
                  !newEmail ||
                  newEmail === initialEmail
                }
              >
                {emailStatus === "saving"
                  ? "Sending confirmation…"
                  : "Send confirmation email"}
              </button>
            </div>
          </>
        )}
      </form>

      <style>{`
        .profile-form { display: flex; flex-direction: column; }
        .profile-section { padding: 8px 0 4px; }
        .profile-section-title {
          font-family: var(--f-display);
          font-size: 19px;
          font-weight: 500;
          margin: 0 0 14px;
          letter-spacing: -0.005em;
        }
        .profile-help {
          font-size: 13px;
          color: var(--ink-soft);
          line-height: 1.55;
          margin: 0 0 18px;
        }
        .profile-row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 14px;
        }
        .profile-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 14px;
        }
        .profile-field span,
        .profile-field-label {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--mute);
          text-transform: uppercase;
        }
        .profile-field input {
          padding: 12px 14px;
          font-family: inherit;
          font-size: 15px;
          background: var(--cream);
          border: 1px solid var(--line);
          border-radius: 10px;
          color: var(--ink);
          box-sizing: border-box;
        }
        .profile-field input:focus {
          outline: none;
          border-color: var(--orange);
        }
        .profile-readonly {
          background: var(--sand) !important;
          color: var(--ink-soft) !important;
        }
        .profile-section-actions {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-top: 4px;
        }
        .profile-btn {
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
        .profile-btn:hover:not(:disabled) { background: var(--orange-deep); }
        .profile-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .profile-feedback {
          font-family: var(--f-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
        }
        .profile-feedback.ok { color: #4d6f4d; }
        .profile-feedback.err { color: #9b3d2c; }
        .profile-hr {
          border: none;
          border-top: 1px solid var(--line);
          margin: 32px 0;
        }
        .profile-success-card {
          background: rgba(124, 167, 124, 0.12);
          border-radius: 12px;
          padding: 18px 20px;
          margin-top: 8px;
        }
        .profile-success-card strong {
          display: block;
          font-family: var(--f-display);
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 6px;
          color: #4d6f4d;
        }
        .profile-success-card p {
          margin: 0;
          font-size: 13px;
          color: var(--ink);
          line-height: 1.55;
        }

        /* Toggle */
        .profile-toggle {
          display: inline-flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          font-size: 14px;
          color: var(--ink);
          margin-bottom: 4px;
        }
        .profile-toggle input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }
        .profile-toggle-track {
          width: 44px;
          height: 26px;
          background: var(--line);
          border-radius: 100px;
          position: relative;
          transition: background 0.18s;
          flex-shrink: 0;
        }
        .profile-toggle-knob {
          position: absolute;
          top: 3px;
          left: 3px;
          width: 20px;
          height: 20px;
          background: #fff;
          border-radius: 50%;
          transition: transform 0.18s;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }
        .profile-toggle input:checked + .profile-toggle-track {
          background: var(--orange);
        }
        .profile-toggle input:checked + .profile-toggle-track .profile-toggle-knob {
          transform: translateX(18px);
        }
        .profile-toggle input:disabled + .profile-toggle-track {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 600px) {
          .profile-row-2 { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
