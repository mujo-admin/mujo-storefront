"use client";

// "Manage subscription" trigger + email-input modal. The default trigger is a
// pill button (used by the footer); pass a `trigger` render prop to swap the
// trigger element while keeping the same modal flow (used by the nav account
// icon).
//
// On submit, POSTs to /api/billing-portal/request. Success state shows a
// "Check your email" confirmation regardless of whether a customer was found
// (anti-enumeration is enforced server-side).

import { useEffect, useState, type ReactNode } from "react";

type TriggerRenderProps = {
  onClick: () => void;
};

export function ManageSubscriptionButton({
  className = "",
  trigger,
}: {
  className?: string;
  /** Optional custom trigger. If omitted, renders a default pill button. */
  trigger?: (props: TriggerRenderProps) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "sent" | "rate_limited" | "error"
  >("idle");

  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("mujo-scroll-locked");
    return () => {
      document.body.classList.remove("mujo-scroll-locked");
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/billing-portal/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) setStatus("rate_limited");
      else if (res.ok) setStatus("sent");
      else setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  function close() {
    setOpen(false);
    setStatus("idle");
    setEmail("");
  }

  const openModal = () => setOpen(true);

  return (
    <>
      {trigger ? (
        trigger({ onClick: openModal })
      ) : (
        <button
          type="button"
          onClick={openModal}
          className={`mujo-manage-pill ${className}`}
        >
          Manage my subscription
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="manage-sub-title"
          onClick={close}
          className="mujo-manage-overlay"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="mujo-manage-card"
          >
            <button
              type="button"
              className="mujo-manage-close"
              aria-label="Close"
              onClick={close}
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

            <h2 id="manage-sub-title" className="mujo-manage-title">
              Manage your <em>subscription</em>
            </h2>

            {status === "sent" ? (
              <>
                <p className="mujo-manage-lede">
                  If that email is on file, a secure link is on its way. The
                  link works for 15 minutes.
                </p>
                <p className="mujo-manage-fineprint">
                  Don&rsquo;t see it? Check your spam folder, or{" "}
                  <button
                    type="button"
                    className="mujo-manage-inline-btn"
                    onClick={() => {
                      setStatus("idle");
                    }}
                  >
                    try a different email
                  </button>
                  .
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="mujo-manage-primary"
                >
                  Got it
                </button>
              </>
            ) : (
              <>
                <p className="mujo-manage-lede">
                  Enter the email on your account. We&rsquo;ll send a one-time
                  link to your inbox &mdash; no password required.
                </p>
                <form onSubmit={submit}>
                  <label
                    htmlFor="mujo-manage-email"
                    className="mujo-manage-label"
                  >
                    Email
                  </label>
                  <input
                    id="mujo-manage-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={status === "loading"}
                    className="mujo-manage-input"
                  />

                  {status === "rate_limited" && (
                    <p className="mujo-manage-error">
                      Too many requests. Please try again in an hour.
                    </p>
                  )}
                  {status === "error" && (
                    <p className="mujo-manage-error">
                      Something went wrong. Please try again.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="mujo-manage-primary"
                  >
                    {status === "loading"
                      ? "Sending…"
                      : "Send me a link"}
                  </button>
                </form>

                <p className="mujo-manage-secure">
                  Secure &middot; one-time use &middot; 15-minute expiry
                </p>
              </>
            )}
          </div>

          <style>{`
            .mujo-manage-overlay {
              position: fixed;
              inset: 0;
              background: rgba(26, 26, 26, 0.5);
              z-index: 1100;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 16px;
              backdrop-filter: blur(4px);
              -webkit-backdrop-filter: blur(4px);
              animation: mujo-manage-fade 0.2s ease-out;
            }
            .mujo-manage-card {
              position: relative;
              background: var(--cream);
              border-radius: 18px;
              padding: 36px 32px 28px;
              max-width: 440px;
              width: 100%;
              font-family: var(--f-body);
              color: var(--ink);
              box-shadow: 0 24px 64px rgba(26, 26, 26, 0.18);
              animation: mujo-manage-rise 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .mujo-manage-close {
              position: absolute;
              top: 14px;
              right: 14px;
              width: 36px;
              height: 36px;
              background: transparent;
              border: none;
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              color: var(--ink-soft);
              border-radius: 50%;
              transition: background 0.15s, color 0.15s;
            }
            .mujo-manage-close:hover {
              background: var(--sage-tint);
              color: var(--ink);
            }
            .mujo-manage-close svg {
              width: 18px;
              height: 18px;
            }
            .mujo-manage-title {
              font-family: var(--f-display);
              font-size: 24px;
              font-weight: 500;
              letter-spacing: -0.01em;
              margin: 0 0 12px;
              line-height: 1.2;
            }
            .mujo-manage-title em {
              font-family: 'Instrument Serif', Georgia, serif;
              font-style: italic;
              color: var(--orange-deep);
              font-weight: 400;
            }
            .mujo-manage-lede {
              font-size: 14px;
              color: var(--ink-soft);
              line-height: 1.55;
              margin: 0 0 20px;
            }
            .mujo-manage-label {
              display: block;
              font-family: var(--f-mono);
              font-size: 11px;
              letter-spacing: 0.08em;
              color: var(--mute);
              text-transform: uppercase;
              margin-bottom: 6px;
            }
            .mujo-manage-input {
              width: 100%;
              padding: 13px 14px;
              font-family: inherit;
              font-size: 15px;
              background: #fff;
              border: 1px solid var(--line);
              border-radius: 10px;
              color: var(--ink);
              transition: border-color 0.15s, box-shadow 0.15s;
              box-sizing: border-box;
            }
            .mujo-manage-input:focus {
              outline: none;
              border-color: var(--orange);
              box-shadow: 0 0 0 3px rgba(242, 104, 47, 0.15);
            }
            .mujo-manage-input:disabled {
              opacity: 0.6;
              cursor: not-allowed;
            }
            .mujo-manage-error {
              font-size: 13px;
              color: #b91c1c;
              margin: 8px 0 0;
              line-height: 1.4;
            }
            .mujo-manage-primary {
              width: 100%;
              background: var(--orange);
              color: #fff;
              border: none;
              cursor: pointer;
              padding: 14px 24px;
              border-radius: 100px;
              font-family: var(--f-body);
              font-size: 14px;
              font-weight: 500;
              margin-top: 16px;
              transition: background 0.15s, opacity 0.15s;
            }
            .mujo-manage-primary:hover:not(:disabled) {
              background: var(--orange-deep);
            }
            .mujo-manage-primary:disabled {
              opacity: 0.6;
              cursor: not-allowed;
            }
            .mujo-manage-secure {
              text-align: center;
              font-family: var(--f-mono);
              font-size: 11px;
              letter-spacing: 0.08em;
              text-transform: uppercase;
              color: var(--mute);
              margin: 16px 0 0;
            }
            .mujo-manage-fineprint {
              font-size: 13px;
              color: var(--mute);
              line-height: 1.5;
              margin: 0 0 18px;
            }
            .mujo-manage-inline-btn {
              background: transparent;
              border: none;
              padding: 0;
              font: inherit;
              color: var(--orange-deep);
              text-decoration: underline;
              text-underline-offset: 2px;
              cursor: pointer;
            }
            .mujo-manage-inline-btn:hover {
              color: var(--orange);
            }
            .mujo-manage-pill {
              background: transparent;
              color: currentColor;
              border: 1px solid currentColor;
              border-radius: 999px;
              padding: 9px 22px;
              font-family: var(--f-body);
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: background 0.15s, color 0.15s;
            }
            .mujo-manage-pill:hover {
              background: currentColor;
              color: var(--cream);
            }
            @keyframes mujo-manage-fade {
              from { opacity: 0; }
              to   { opacity: 1; }
            }
            @keyframes mujo-manage-rise {
              from { opacity: 0; transform: translateY(12px); }
              to   { opacity: 1; transform: translateY(0); }
            }
            @media (max-width: 600px) {
              .mujo-manage-card {
                padding: 28px 22px 24px;
                border-radius: 16px;
              }
              .mujo-manage-title { font-size: 22px; }
              .mujo-manage-lede { font-size: 13px; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}
