"use client";

// Client component: Quick changes section (Skip next delivery) + Need a
// break section (Pause / Cancel / Resume) with confirmation modals.
//
// The detail card (image, name, status pill, fields grid) is rendered by
// the parent server page — this component owns only the action buttons +
// modal state that need client-side interactivity.
//
// Cancel is a 2-step modal per plan §5.3 — reason picker (mapped to Stripe
// cancellation_details.feedback) + confirmation.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GiftModal, type GiftableProduct } from "./gift-modal";

export type SubscriptionDetail = {
  stripeSubscriptionId: string;
  productLabel: string;
  status: string;
  /** Live Stripe Price ID — used to highlight current selection in swap modal. */
  stripePriceId: string;
  currentPeriodEnd: string; // ISO
  cancelAtPeriodEnd: boolean;
  pausedAt: string | null;
  unitAmountCents: number | null;
  /** Effective per-delivery price (post-coupon). Used for the gift charge total. */
  effectiveAmountCents: number | null;
  currency: string;
  createdAt: string;
};

export type SwapOption = {
  priceId: string;
  label: string;
  /** "$X.XX / delivery" — sub price after coupon. */
  priceLabel: string;
};

type Action =
  | "pause"
  | "skip-next"
  | "cancel"
  | "resume"
  | "send-now"
  | "swap"
  | "gift";

const CANCEL_REASONS: Array<{ id: string; label: string }> = [
  { id: "too_expensive", label: "Too expensive" },
  { id: "missing_features", label: "Missing something I need" },
  { id: "low_quality", label: "Quality didn't meet expectations" },
  { id: "switched_service", label: "Switched to another product" },
  { id: "unused", label: "I'm not using it enough" },
  { id: "customer_service", label: "Customer service issue" },
  { id: "too_complex", label: "Too complex / hard to use" },
  { id: "other", label: "Other reason" },
];

export function SubscriptionControls({
  detail,
  swapOptions,
  giftOptions,
  senderEmail,
}: {
  detail: SubscriptionDetail;
  /** Other Ritual SKUs the customer can swap into. Excludes the current Price. */
  swapOptions: SwapOption[];
  /** All Mujo sub Prices that can be gifted (including current — flagged isCurrent). */
  giftOptions: GiftableProduct[];
  /** Customer's email — pre-fills the gift recipient email field. */
  senderEmail: string;
}) {
  const router = useRouter();
  const [openModal, setOpenModal] = useState<Action | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [cancelStep, setCancelStep] = useState<1 | 2>(1);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [cancelComment, setCancelComment] = useState<string>("");
  const [pauseCycles, setPauseCycles] = useState<1 | 2 | 3>(1);
  const [swapTarget, setSwapTarget] = useState<string>("");

  const isPaused = detail.status === "paused" || detail.pausedAt !== null;
  const isCanceling = detail.cancelAtPeriodEnd;
  const isResumable = isPaused || isCanceling;

  function closeModal() {
    setOpenModal(null);
    setCancelStep(1);
    setCancelReason("");
    setCancelComment("");
    setPauseCycles(1);
    setSwapTarget("");
    setError(null);
  }

  // Body scroll lock + Escape close while a modal is open.
  useEffect(() => {
    if (!openModal) return;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeModal();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openModal]);

  async function performAction(action: Action, body?: Record<string, unknown>) {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`/api/account/subscription/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? `Request failed (${res.status})`);
      }
      closeModal();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      {/* Quick changes section — only shown when sub is not in resume state */}
      {!isResumable ? (
        <section className="sub-actions-section">
          <header className="sub-actions-section-head">
            <span className="acc-eyebrow-orange">Quick changes</span>
            <h3>
              One tap. <em>That&rsquo;s it.</em>
            </h3>
            <p>
              Anything here updates instantly. We&rsquo;ll send a confirmation
              email so you have a record.
            </p>
          </header>
          <div className="sub-action-grid">
            <button
              type="button"
              className="sub-action-btn"
              onClick={() => setOpenModal("skip-next")}
              disabled={pending !== null}
            >
              <span className="sub-action-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="13 17 18 12 13 7" />
                  <line x1="6" y1="12" x2="18" y2="12" />
                </svg>
              </span>
              <span className="sub-action-text">
                <strong>Skip the next delivery</strong>
                <span>We&rsquo;ll bump it forward and resume on schedule.</span>
              </span>
            </button>

            <button
              type="button"
              className="sub-action-btn"
              onClick={() => setOpenModal("send-now")}
              disabled={pending !== null}
            >
              <span className="sub-action-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="13 2 13 10 19 10 11 22 11 14 5 14 13 2" />
                </svg>
              </span>
              <span className="sub-action-text">
                <strong>Send my next box now</strong>
                <span>Run out early? We&rsquo;ll bill today and reset the cycle.</span>
              </span>
            </button>

            {swapOptions.length > 0 ? (
              <button
                type="button"
                className="sub-action-btn"
                onClick={() => setOpenModal("swap")}
                disabled={pending !== null}
              >
                <span className="sub-action-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                  </svg>
                </span>
                <span className="sub-action-text">
                  <strong>Swap to a different SKU</strong>
                  <span>Try the 10-serving size or change the plan.</span>
                </span>
              </button>
            ) : null}

            <Link
              href="/account/payment-method"
              className="sub-action-btn sub-action-btn-link"
              aria-disabled={pending !== null}
            >
              <span className="sub-action-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="6" width="18" height="13" rx="2" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </span>
              <span className="sub-action-text">
                <strong>Update payment method</strong>
                <span>New card on file. Used for the next renewal.</span>
              </span>
            </Link>

            <button
              type="button"
              className="sub-action-btn"
              onClick={() => setOpenModal("gift")}
              disabled={pending !== null}
            >
              <span className="sub-action-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 12 20 22 4 22 4 12" />
                  <rect x="2" y="7" width="20" height="5" />
                  <line x1="12" y1="22" x2="12" y2="7" />
                  <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                  <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                </svg>
              </span>
              <span className="sub-action-text">
                <strong>Send one as a gift</strong>
                <span>Same member rate, sent to a friend.</span>
              </span>
            </button>

            <Link
              href="/contact"
              className="sub-action-btn sub-action-btn-link"
              aria-disabled={pending !== null}
            >
              <span className="sub-action-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </span>
              <span className="sub-action-text">
                <strong>Need a hand?</strong>
                <span>Real human, working-day reply.</span>
              </span>
            </Link>
          </div>
        </section>
      ) : null}

      {/* Need a break section */}
      <section className="sub-danger">
        <header className="sub-danger-head">
          <span className="acc-eyebrow-mute">
            {isResumable ? "Resume" : "Need a break"}
          </span>
          <h3>
            {isResumable
              ? "Glad to have you back."
              : "Pause or cancel."}
            {!isResumable ? (
              <>
                {" "}
                <em>No interrogation.</em>
              </>
            ) : null}
          </h3>
        </header>
        {isResumable ? (
          <p>
            {isPaused
              ? "Pick up where you left off. We'll resume on your next cycle."
              : "Cancel pending — change your mind anytime before " +
                formatLongDate(detail.currentPeriodEnd) +
                "."}
          </p>
        ) : (
          <p>
            Going on holiday or stepping away for a while? Pause for up to 3
            months without losing your member rate. Cancelling is fine too —
            no five-step exit interview, no salt.
          </p>
        )}
        <div className="sub-danger-btns">
          {isResumable ? (
            <button
              type="button"
              className="sub-danger-btn primary"
              onClick={() => setOpenModal("resume")}
              disabled={pending !== null}
            >
              Resume subscription
            </button>
          ) : (
            <>
              <button
                type="button"
                className="sub-danger-btn"
                onClick={() => setOpenModal("pause")}
                disabled={pending !== null}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
                Pause subscription
              </button>
              <button
                type="button"
                className="sub-danger-btn"
                onClick={() => setOpenModal("cancel")}
                disabled={pending !== null}
              >
                Cancel subscription
              </button>
            </>
          )}
        </div>
      </section>

      {/* --- Modals --- */}

      {openModal === "pause" ? (
        <Modal onClose={closeModal} title="Pause" titleAccent="subscription.">
          <p className="modal-body-text">
            Skip your next delivery and pause billing for{" "}
            <strong>{pauseCycles}</strong>{" "}
            {pauseCycles === 1 ? "cycle" : "cycles"}. Resumes automatically
            after — keep your member rate.
          </p>
          <div className="modal-options">
            {[1, 2, 3].map((n) => (
              <button
                key={n}
                type="button"
                className={`modal-option ${pauseCycles === n ? "selected" : ""}`}
                onClick={() => setPauseCycles(n as 1 | 2 | 3)}
              >
                Pause for {n} {n === 1 ? "month" : "months"}
              </button>
            ))}
          </div>
          {error ? <p className="modal-error">{error}</p> : null}
          <ModalFoot
            onCancel={closeModal}
            onConfirm={() => performAction("pause", { cycles: pauseCycles })}
            confirmLabel="Pause subscription"
            pending={pending === "pause"}
          />
        </Modal>
      ) : null}

      {openModal === "skip-next" ? (
        <Modal onClose={closeModal} title="Skip this" titleAccent="delivery?">
          <p className="modal-body-text">
            Your next delivery on{" "}
            <strong>{formatLongDate(detail.currentPeriodEnd)}</strong> will be
            skipped. Billing resumes on the cycle after. No charge in the
            meantime.
          </p>
          {error ? <p className="modal-error">{error}</p> : null}
          <ModalFoot
            onCancel={closeModal}
            onConfirm={() => performAction("skip-next")}
            confirmLabel="Yes, skip"
            pending={pending === "skip-next"}
          />
        </Modal>
      ) : null}

      {openModal === "cancel" ? (
        <Modal onClose={closeModal} title="Cancel" titleAccent="subscription.">
          {cancelStep === 1 ? (
            <>
              <p className="modal-body-text">
                We&rsquo;re sorry to see you go. Could you tell us why? Your
                answer helps us improve. (Optional but appreciated.)
              </p>
              <div className="modal-options">
                {CANCEL_REASONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className={`modal-option ${cancelReason === r.id ? "selected" : ""}`}
                    onClick={() => setCancelReason(r.id)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <label className="modal-textarea-label">
                <span>Anything else? (optional)</span>
                <textarea
                  className="modal-textarea"
                  rows={3}
                  maxLength={500}
                  value={cancelComment}
                  onChange={(e) => setCancelComment(e.target.value)}
                  placeholder="Optional — tell us more."
                />
              </label>
              <ModalFoot
                onCancel={closeModal}
                onConfirm={() => setCancelStep(2)}
                confirmLabel="Continue"
                disabled={!cancelReason}
              />
            </>
          ) : (
            <>
              <p className="modal-body-text">
                That&rsquo;s fine. No questions, no five-step exit. You&rsquo;ll
                keep access until{" "}
                <strong>{formatLongDate(detail.currentPeriodEnd)}</strong>.
                Then billing stops.
              </p>
              <p className="modal-secondary-text">
                Change your mind? You can resume anytime before that date.
              </p>
              {error ? <p className="modal-error">{error}</p> : null}
              <ModalFoot
                onCancel={() => setCancelStep(1)}
                cancelLabel="← Back"
                onConfirm={() =>
                  performAction("cancel", {
                    reason: cancelReason,
                    comment: cancelComment || undefined,
                  })
                }
                confirmLabel="Cancel subscription"
                pending={pending === "cancel"}
              />
            </>
          )}
        </Modal>
      ) : null}

      {openModal === "resume" ? (
        <Modal onClose={closeModal} title="Resume" titleAccent="subscription.">
          <p className="modal-body-text">
            {isPaused
              ? "Resume billing on your next cycle? Your subscription will continue from where it paused."
              : "Stay subscribed and continue your deliveries? We'll cancel the pending cancellation."}
          </p>
          {error ? <p className="modal-error">{error}</p> : null}
          <ModalFoot
            onCancel={closeModal}
            onConfirm={() => performAction("resume")}
            confirmLabel="Resume subscription"
            pending={pending === "resume"}
          />
        </Modal>
      ) : null}

      {openModal === "send-now" ? (
        <Modal onClose={closeModal} title="Send the next box" titleAccent="now?">
          <p className="modal-body-text">
            We&rsquo;ll bill your card today and ship as soon as possible. Your
            cycle resets — your next delivery after this one will be one full
            cycle from today.
          </p>
          <p className="modal-secondary-text">
            Note: this immediately charges your saved card.
          </p>
          {error ? <p className="modal-error">{error}</p> : null}
          <ModalFoot
            onCancel={closeModal}
            onConfirm={() => performAction("send-now")}
            confirmLabel="Yes, ship today"
            pending={pending === "send-now"}
          />
        </Modal>
      ) : null}

      {openModal === "gift" ? (
        <GiftModal
          giftOptions={giftOptions}
          senderEmail={senderEmail}
          onClose={closeModal}
          onSuccess={() => router.refresh()}
        />
      ) : null}

      {openModal === "swap" ? (
        <Modal onClose={closeModal} title="Swap to a" titleAccent="different SKU.">
          <p className="modal-body-text">
            Pick the new product. Same subscription cadence, same renewal date.
            We&rsquo;ll prorate your next charge.
          </p>
          <div className="modal-options">
            {swapOptions.map((opt) => (
              <button
                key={opt.priceId}
                type="button"
                className={`modal-option ${swapTarget === opt.priceId ? "selected" : ""}`}
                onClick={() => setSwapTarget(opt.priceId)}
              >
                <strong>{opt.label}</strong>
                <span className="modal-option-meta">{opt.priceLabel}</span>
              </button>
            ))}
          </div>
          {error ? <p className="modal-error">{error}</p> : null}
          <ModalFoot
            onCancel={closeModal}
            onConfirm={() =>
              performAction("swap", { priceId: swapTarget })
            }
            confirmLabel="Swap subscription"
            disabled={!swapTarget}
            pending={pending === "swap"}
          />
        </Modal>
      ) : null}

      <style>{`
        /* Quick changes section */
        .sub-actions-section {
          background: #fff;
          border: 1px solid rgba(26, 26, 26, 0.06);
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 20px;
        }
        @media (min-width: 768px) {
          .sub-actions-section { padding: 32px; }
        }
        .sub-actions-section-head { margin-bottom: 18px; }
        .acc-eyebrow-orange {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--orange-deep);
          font-weight: 500;
          display: inline-block;
          margin-bottom: 8px;
        }
        .acc-eyebrow-mute {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--mute);
          font-weight: 500;
          display: inline-block;
          margin-bottom: 8px;
        }
        .sub-actions-section-head h3 {
          font-family: var(--f-display);
          font-size: 22px;
          font-weight: 500;
          margin: 0;
          line-height: 1.2;
          letter-spacing: -0.02em;
          color: var(--ink);
        }
        .sub-actions-section-head h3 em {
          font-family: var(--f-serif);
          font-style: italic;
          color: var(--orange);
          font-weight: 400;
        }
        .sub-actions-section-head p {
          font-size: 14px;
          color: var(--ink-soft);
          margin: 6px 0 0;
          line-height: 1.55;
          max-width: 480px;
        }

        .sub-action-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        @media (min-width: 640px) {
          .sub-action-grid { grid-template-columns: 1fr 1fr; }
        }
        .sub-action-btn {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
          background: var(--cream);
          border: 1px solid transparent;
          border-radius: 12px;
          text-decoration: none;
          color: var(--ink);
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          font-family: var(--f-body);
          width: 100%;
        }
        .sub-action-btn:hover:not(:disabled) {
          border-color: var(--orange);
          background: #fff;
        }
        .sub-action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sub-action-btn-link {
          text-decoration: none;
        }
        .sub-action-btn-link[aria-disabled="true"] {
          opacity: 0.5;
          pointer-events: none;
        }
        .sub-action-icon {
          width: 40px;
          height: 40px;
          background: #fff;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: var(--orange-deep);
        }
        .sub-action-icon svg { width: 18px; height: 18px; }
        .sub-action-text {
          flex: 1;
          min-width: 0;
        }
        .sub-action-text strong {
          display: block;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.3;
          margin-bottom: 2px;
          color: var(--ink);
        }
        .sub-action-text > span {
          font-size: 12px;
          color: var(--ink-soft);
          line-height: 1.4;
        }

        /* Pause / cancel zone */
        .sub-danger {
          background: #fff;
          border: 1px solid rgba(26, 26, 26, 0.06);
          border-radius: 16px;
          padding: 24px;
        }
        @media (min-width: 768px) {
          .sub-danger { padding: 32px; }
        }
        .sub-danger-head { margin-bottom: 14px; }
        .sub-danger-head h3 {
          font-family: var(--f-display);
          font-size: 18px;
          font-weight: 500;
          margin: 0;
          letter-spacing: -0.01em;
          color: var(--ink);
        }
        .sub-danger-head h3 em {
          font-family: var(--f-serif);
          font-style: italic;
          color: var(--orange);
          font-weight: 400;
        }
        .sub-danger p {
          font-size: 13px;
          color: var(--ink-soft);
          margin: 0 0 14px;
          line-height: 1.6;
          max-width: 540px;
        }
        .sub-danger-btns {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .sub-danger-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 10px 18px;
          background: transparent;
          border: 1px solid rgba(26, 26, 26, 0.09);
          border-radius: 100px;
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-soft);
          cursor: pointer;
          transition: all 0.2s;
          font-weight: 500;
        }
        .sub-danger-btn:hover:not(:disabled) {
          border-color: var(--ink);
          color: var(--ink);
        }
        .sub-danger-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sub-danger-btn svg { width: 14px; height: 14px; }
        .sub-danger-btn.primary {
          background: var(--orange);
          color: #fff;
          border-color: var(--orange);
        }
        .sub-danger-btn.primary:hover:not(:disabled) {
          background: var(--orange-deep);
          border-color: var(--orange-deep);
          color: #fff;
        }

        /* Modal */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(26, 26, 26, 0.55);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          z-index: 9999;
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 7vh 16px 16px;
          overflow-y: auto;
        }
        .modal-card {
          background: var(--cream);
          border-radius: 16px;
          padding: 28px;
          max-width: 460px;
          width: 100%;
          font-family: var(--f-body);
          color: var(--ink);
          position: relative;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.18);
        }
        .modal-close {
          position: absolute;
          top: 14px;
          right: 14px;
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 22px;
          color: var(--mute);
          line-height: 1;
          padding: 4px 8px;
        }
        .modal-close:hover { color: var(--ink); }
        .modal-title {
          font-family: var(--f-display);
          font-size: 22px;
          font-weight: 500;
          margin: 0 0 14px;
          letter-spacing: -0.02em;
          line-height: 1.2;
          color: var(--ink);
        }
        .modal-title em {
          font-family: var(--f-serif);
          font-style: italic;
          color: var(--orange);
          font-weight: 400;
        }
        .modal-body-text {
          font-size: 14px;
          line-height: 1.55;
          color: var(--ink);
          margin: 0 0 16px;
        }
        .modal-secondary-text {
          font-size: 13px;
          line-height: 1.55;
          color: var(--ink-soft);
          margin: 0 0 18px;
        }
        .modal-options {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 18px;
        }
        .modal-option {
          padding: 12px 16px;
          background: #fff;
          border: 1px solid rgba(26, 26, 26, 0.09);
          border-radius: 10px;
          cursor: pointer;
          font-family: var(--f-body);
          font-size: 14px;
          text-align: left;
          transition: all 0.15s;
          color: var(--ink);
        }
        .modal-option:hover { border-color: var(--orange); }
        .modal-option.selected {
          border-color: var(--orange);
          background: rgba(242, 104, 47, 0.06);
        }
        .modal-option strong {
          display: block;
          font-weight: 500;
          color: var(--ink);
          margin-bottom: 2px;
        }
        .modal-option-meta {
          display: block;
          font-family: var(--f-mono);
          font-size: 12px;
          color: var(--ink-soft);
          letter-spacing: 0.04em;
        }
        .modal-textarea-label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 18px;
        }
        .modal-textarea-label span {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--mute);
          text-transform: uppercase;
        }
        .modal-textarea {
          width: 100%;
          padding: 11px 12px;
          font-family: inherit;
          font-size: 14px;
          background: #fff;
          border: 1px solid rgba(26, 26, 26, 0.09);
          border-radius: 10px;
          color: var(--ink);
          resize: vertical;
          box-sizing: border-box;
        }
        .modal-textarea:focus {
          outline: none;
          border-color: var(--orange);
        }
        .modal-error {
          font-size: 13px;
          color: #9b3d2c;
          margin: 0 0 12px;
        }
        .modal-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }
        .modal-btn {
          padding: 10px 18px;
          border-radius: 100px;
          font-family: var(--f-body);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: all 0.2s;
        }
        .modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .modal-btn-primary { background: var(--orange); color: #fff; }
        .modal-btn-primary:hover:not(:disabled) { background: var(--orange-deep); }
        .modal-btn-secondary {
          background: transparent;
          color: var(--ink-soft);
          border: 1px solid rgba(26, 26, 26, 0.09);
        }
        .modal-btn-secondary:hover:not(:disabled) {
          color: var(--ink);
          border-color: var(--ink);
        }
      `}</style>
    </>
  );
}

function Modal({
  title,
  titleAccent,
  onClose,
  children,
}: {
  title: string;
  titleAccent: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={`${title} ${titleAccent}`}
    >
      <div className="modal-card">
        <button
          type="button"
          aria-label="Close"
          className="modal-close"
          onClick={onClose}
        >
          ×
        </button>
        <h3 className="modal-title">
          {title} <em>{titleAccent}</em>
        </h3>
        {children}
      </div>
    </div>
  );
}

function ModalFoot({
  onCancel,
  onConfirm,
  confirmLabel,
  cancelLabel = "Never mind",
  disabled = false,
  pending = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  cancelLabel?: string;
  disabled?: boolean;
  pending?: boolean;
}) {
  return (
    <div className="modal-actions">
      <button
        type="button"
        className="modal-btn modal-btn-secondary"
        onClick={onCancel}
        disabled={pending}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        className="modal-btn modal-btn-primary"
        onClick={onConfirm}
        disabled={disabled || pending}
      >
        {pending ? "Working…" : confirmLabel}
      </button>
    </div>
  );
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
