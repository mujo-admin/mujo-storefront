"use client";

// Client component: subscription detail card + 4 action buttons (pause, skip
// next, cancel, resume) with confirmation modals.
//
// Modals use a body-scroll-lock + Escape-to-close + click-outside-to-close
// pattern matching the existing /components/ManageSubscriptionButton.tsx.
//
// Cancel is a 2-step modal per plan §5.3 — reason picker + confirmation.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type SubscriptionDetail = {
  stripeSubscriptionId: string;
  productLabel: string;
  status: string;
  currentPeriodEnd: string; // ISO
  cancelAtPeriodEnd: boolean;
  pausedAt: string | null; // ISO
  unitAmountCents: number | null;
  currency: string;
  createdAt: string; // ISO
};

type Action = "pause" | "skip-next" | "cancel" | "resume";

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

export function SubscriptionControls({ detail }: { detail: SubscriptionDetail }) {
  const router = useRouter();
  const [openModal, setOpenModal] = useState<Action | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Step 1: 3-input cancel modal state.
  const [cancelStep, setCancelStep] = useState<1 | 2>(1);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [cancelComment, setCancelComment] = useState<string>("");
  const [pauseCycles, setPauseCycles] = useState<1 | 2 | 3>(1);

  const isPaused = detail.status === "paused" || detail.pausedAt !== null;
  const isCanceling = detail.cancelAtPeriodEnd;
  const isResumable = isPaused || isCanceling;

  function closeModal() {
    setOpenModal(null);
    setCancelStep(1);
    setCancelReason("");
    setCancelComment("");
    setPauseCycles(1);
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
    <div className="ctrl-shell">
      {/* Detail card */}
      <div className="ctrl-detail">
        <div className="ctrl-detail-row">
          <div className="ctrl-eyebrow">Plan</div>
          <div className="ctrl-value">{detail.productLabel}</div>
        </div>
        <div className="ctrl-detail-row">
          <div className="ctrl-eyebrow">Status</div>
          <div className="ctrl-value">
            <StatusPill detail={detail} />
          </div>
        </div>
        {detail.unitAmountCents !== null ? (
          <div className="ctrl-detail-row">
            <div className="ctrl-eyebrow">Price per cycle</div>
            <div className="ctrl-value">
              {formatCents(detail.unitAmountCents, detail.currency)}
            </div>
          </div>
        ) : null}
        <div className="ctrl-detail-row">
          <div className="ctrl-eyebrow">
            {isCanceling ? "Access until" : "Next delivery"}
          </div>
          <div className="ctrl-value">{formatDate(detail.currentPeriodEnd)}</div>
        </div>
        <div className="ctrl-detail-row">
          <div className="ctrl-eyebrow">Active since</div>
          <div className="ctrl-value">{formatDate(detail.createdAt)}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="ctrl-actions">
        {isResumable ? (
          <button
            type="button"
            className="ctrl-btn ctrl-btn-primary"
            onClick={() => setOpenModal("resume")}
            disabled={pending !== null}
          >
            Resume subscription
          </button>
        ) : (
          <>
            <button
              type="button"
              className="ctrl-btn ctrl-btn-secondary"
              onClick={() => setOpenModal("skip-next")}
              disabled={pending !== null}
            >
              Skip next delivery
            </button>
            <button
              type="button"
              className="ctrl-btn ctrl-btn-secondary"
              onClick={() => setOpenModal("pause")}
              disabled={pending !== null}
            >
              Pause subscription
            </button>
            <button
              type="button"
              className="ctrl-btn ctrl-btn-tertiary"
              onClick={() => setOpenModal("cancel")}
              disabled={pending !== null}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      <p className="ctrl-fineprint">
        Changes take effect at the end of the current billing period. You keep
        access to anything already paid for. No fees for pausing or cancelling.
      </p>

      {/* Modals */}
      {openModal === "pause" ? (
        <Modal onClose={closeModal} title="Pause subscription">
          <p className="modal-body-text">
            Skip your next delivery and pause billing for{" "}
            <strong>{pauseCycles}</strong> cycle{pauseCycles === 1 ? "" : "s"}.
            Your subscription resumes automatically after.
          </p>
          <fieldset className="modal-fieldset">
            <legend className="modal-legend">Pause for</legend>
            <div className="modal-radio-row">
              {[1, 2, 3].map((n) => (
                <label key={n} className="modal-radio">
                  <input
                    type="radio"
                    name="pause-cycles"
                    value={n}
                    checked={pauseCycles === n}
                    onChange={() => setPauseCycles(n as 1 | 2 | 3)}
                  />
                  <span>
                    {n} cycle{n === 1 ? "" : "s"}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {error ? <p className="modal-error">{error}</p> : null}
          <ModalActions
            onCancel={closeModal}
            onConfirm={() => performAction("pause", { cycles: pauseCycles })}
            confirmLabel="Pause subscription"
            pending={pending === "pause"}
          />
        </Modal>
      ) : null}

      {openModal === "skip-next" ? (
        <Modal onClose={closeModal} title="Skip next delivery">
          <p className="modal-body-text">
            Your next delivery on{" "}
            <strong>{formatDate(detail.currentPeriodEnd)}</strong> will be
            skipped. Billing will resume on the cycle after.
          </p>
          {error ? <p className="modal-error">{error}</p> : null}
          <ModalActions
            onCancel={closeModal}
            onConfirm={() => performAction("skip-next")}
            confirmLabel="Skip next delivery"
            pending={pending === "skip-next"}
          />
        </Modal>
      ) : null}

      {openModal === "cancel" ? (
        <Modal onClose={closeModal} title="Cancel subscription">
          {cancelStep === 1 ? (
            <>
              <p className="modal-body-text">
                We're sorry to see you go. Could you tell us why? Your answer
                helps us improve.
              </p>
              <fieldset className="modal-fieldset">
                <div className="modal-radio-stack">
                  {CANCEL_REASONS.map((r) => (
                    <label key={r.id} className="modal-radio">
                      <input
                        type="radio"
                        name="cancel-reason"
                        value={r.id}
                        checked={cancelReason === r.id}
                        onChange={() => setCancelReason(r.id)}
                      />
                      <span>{r.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
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
              <ModalActions
                onCancel={closeModal}
                onConfirm={() => setCancelStep(2)}
                confirmLabel="Continue"
                disabled={!cancelReason}
              />
            </>
          ) : (
            <>
              <p className="modal-body-text">
                Cancel at the end of the current billing period? You'll keep
                access until{" "}
                <strong>{formatDate(detail.currentPeriodEnd)}</strong>, then
                billing stops.
              </p>
              <p className="modal-secondary-text">
                Change your mind? You can resume anytime before that date.
              </p>
              {error ? <p className="modal-error">{error}</p> : null}
              <ModalActions
                onCancel={() => setCancelStep(1)}
                cancelLabel="← Back"
                onConfirm={() =>
                  performAction("cancel", {
                    reason: cancelReason,
                    comment: cancelComment || undefined,
                  })
                }
                confirmLabel="Cancel subscription"
                confirmDanger
                pending={pending === "cancel"}
              />
            </>
          )}
        </Modal>
      ) : null}

      {openModal === "resume" ? (
        <Modal onClose={closeModal} title="Resume subscription">
          <p className="modal-body-text">
            {isPaused
              ? "Resume billing on your next cycle? Your subscription will continue from where it paused."
              : "Stay subscribed and continue your deliveries? We'll cancel the pending cancellation."}
          </p>
          {error ? <p className="modal-error">{error}</p> : null}
          <ModalActions
            onCancel={closeModal}
            onConfirm={() => performAction("resume")}
            confirmLabel="Resume subscription"
            pending={pending === "resume"}
          />
        </Modal>
      ) : null}

      <style>{`
        .ctrl-shell { display: flex; flex-direction: column; gap: 22px; }
        .ctrl-detail {
          background: var(--cream);
          border-radius: 14px;
          padding: 22px 22px 6px;
          display: flex;
          flex-direction: column;
        }
        .ctrl-detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid var(--line);
          gap: 14px;
        }
        .ctrl-detail-row:last-child { border-bottom: none; }
        .ctrl-eyebrow {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--mute);
          text-transform: uppercase;
        }
        .ctrl-value {
          font-size: 14px;
          color: var(--ink);
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .ctrl-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .ctrl-btn {
          font-family: var(--f-body);
          font-size: 14px;
          font-weight: 500;
          padding: 12px 22px;
          border-radius: 100px;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .ctrl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .ctrl-btn-primary {
          background: var(--orange);
          color: #fff;
          border: 1px solid var(--orange);
        }
        .ctrl-btn-primary:hover:not(:disabled) { background: var(--orange-deep); }
        .ctrl-btn-secondary {
          background: transparent;
          color: var(--ink);
          border: 1px solid var(--line);
        }
        .ctrl-btn-secondary:hover:not(:disabled) {
          border-color: var(--orange);
          color: var(--orange-deep);
        }
        .ctrl-btn-tertiary {
          background: transparent;
          color: var(--ink-soft);
          border: 1px solid transparent;
          padding: 12px 12px;
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .ctrl-btn-tertiary:hover:not(:disabled) { color: #9b3d2c; }
        .ctrl-fineprint {
          font-size: 12px;
          color: var(--mute);
          line-height: 1.55;
          margin: 0;
          max-width: 540px;
        }

        /* --- Modal --- */
        .modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(15, 15, 15, 0.55);
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
          border-radius: 18px;
          padding: 28px;
          max-width: 460px;
          width: 100%;
          font-family: var(--f-body);
          color: var(--ink);
          position: relative;
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
          letter-spacing: -0.01em;
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
        .modal-fieldset { border: none; padding: 0; margin: 0 0 16px; }
        .modal-legend {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--mute);
          text-transform: uppercase;
          padding: 0;
          margin-bottom: 8px;
        }
        .modal-radio-row {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .modal-radio-stack {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .modal-radio {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: var(--sand);
          padding: 10px 14px;
          border-radius: 100px;
          cursor: pointer;
          font-size: 13px;
          color: var(--ink);
          border: 1px solid transparent;
        }
        .modal-radio input { accent-color: var(--orange); }
        .modal-radio:has(input:checked) {
          border-color: var(--orange);
          background: rgba(242, 104, 47, 0.08);
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
          background: var(--sand);
          border: 1px solid var(--line);
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
          justify-content: flex-end;
          gap: 10px;
          margin-top: 8px;
        }
        .modal-btn {
          font-family: var(--f-body);
          font-size: 14px;
          font-weight: 500;
          padding: 11px 22px;
          border-radius: 100px;
          cursor: pointer;
          border: 1px solid transparent;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .modal-btn-cancel {
          background: transparent;
          color: var(--ink-soft);
          border-color: var(--line);
        }
        .modal-btn-cancel:hover:not(:disabled) {
          border-color: var(--ink);
          color: var(--ink);
        }
        .modal-btn-confirm {
          background: var(--orange);
          color: #fff;
        }
        .modal-btn-confirm:hover:not(:disabled) { background: var(--orange-deep); }
        .modal-btn-confirm.danger { background: #9b3d2c; }
        .modal-btn-confirm.danger:hover:not(:disabled) { background: #7d2f23; }
      `}</style>
    </div>
  );
}

function StatusPill({ detail }: { detail: SubscriptionDetail }) {
  const isPaused = detail.status === "paused" || detail.pausedAt !== null;
  const isCanceling = detail.cancelAtPeriodEnd;
  const cls = isPaused
    ? "paused"
    : isCanceling
      ? "canceling"
      : detail.status === "past_due"
        ? "past_due"
        : "active";
  const text = isPaused
    ? "Paused"
    : isCanceling
      ? "Cancels at period end"
      : detail.status === "past_due"
        ? "Payment overdue"
        : detail.status === "trialing"
          ? "Trial"
          : "Active";
  return <span className={`status-pill ${cls}`}>{text}<style>{`
    .status-pill {
      display: inline-block;
      font-family: var(--f-mono);
      font-size: 10px;
      letter-spacing: 0.06em;
      padding: 3px 9px;
      border-radius: 999px;
      text-transform: uppercase;
    }
    .status-pill.active { background: rgba(124, 167, 124, 0.18); color: #4d6f4d; }
    .status-pill.paused { background: rgba(242, 169, 47, 0.16); color: #8b5a07; }
    .status-pill.canceling { background: rgba(220, 90, 70, 0.14); color: #9b3d2c; }
    .status-pill.past_due { background: rgba(220, 90, 70, 0.18); color: #9b3d2c; }
  `}</style></span>;
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
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
      aria-label={title}
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
        <h2 className="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function ModalActions({
  onCancel,
  onConfirm,
  confirmLabel,
  cancelLabel = "Never mind",
  confirmDanger = false,
  disabled = false,
  pending = false,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  cancelLabel?: string;
  confirmDanger?: boolean;
  disabled?: boolean;
  pending?: boolean;
}) {
  return (
    <div className="modal-actions">
      <button
        type="button"
        className="modal-btn modal-btn-cancel"
        onClick={onCancel}
        disabled={pending}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        className={`modal-btn modal-btn-confirm ${confirmDanger ? "danger" : ""}`}
        onClick={onConfirm}
        disabled={disabled || pending}
      >
        {pending ? "Working…" : confirmLabel}
      </button>
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
