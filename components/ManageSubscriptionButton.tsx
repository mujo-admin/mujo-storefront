'use client';

// "Manage subscription" trigger + email-input modal. The default trigger is a
// pill button (used by the footer); pass a `trigger` render prop to swap the
// trigger element while keeping the same modal flow (used by the nav account
// icon).
//
// On submit, POSTs to /api/billing-portal/request. Success state shows a
// "Check your email" confirmation regardless of whether a customer was found
// (anti-enumeration is enforced server-side).

import { useState, type ReactNode } from 'react';

type TriggerRenderProps = {
  onClick: () => void;
};

export function ManageSubscriptionButton({
  className = '',
  trigger,
}: {
  className?: string;
  /** Optional custom trigger. If omitted, renders a default pill button. */
  trigger?: (props: TriggerRenderProps) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'sent' | 'rate_limited' | 'error'>(
    'idle',
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/billing-portal/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.status === 429) setStatus('rate_limited');
      else if (res.ok) setStatus('sent');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  }

  function close() {
    setOpen(false);
    setStatus('idle');
    setEmail('');
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
          className={className}
          style={{
            background: 'transparent',
            border: '1px solid currentColor',
            borderRadius: 999,
            padding: '8px 18px',
            fontSize: 14,
            cursor: 'pointer',
          }}
        >
          Manage my subscription
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={close}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,15,15,0.5)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#f5f0e6',
              borderRadius: 16,
              padding: 32,
              maxWidth: 440,
              width: '100%',
            }}
          >
            <h2
              style={{
                fontFamily: '"Instrument Serif", Georgia, serif',
                fontSize: 24,
                margin: '0 0 8px 0',
                fontWeight: 400,
              }}
            >
              Manage your Mujo subscription
            </h2>
            <p style={{ fontSize: 14, color: '#555', margin: '0 0 16px 0' }}>
              Enter the email on your account. We&apos;ll send you a one-time link.
            </p>

            {status === 'sent' ? (
              <>
                <p style={{ fontSize: 15, lineHeight: 1.5 }}>
                  If that email is on file, you will receive a link shortly. The link works for
                  15 minutes.
                </p>
                <button
                  type="button"
                  onClick={close}
                  style={{
                    marginTop: 16,
                    background: '#f2682f',
                    color: 'white',
                    border: 'none',
                    borderRadius: 999,
                    padding: '10px 24px',
                    cursor: 'pointer',
                  }}
                >
                  Close
                </button>
              </>
            ) : (
              <form onSubmit={submit}>
                <label
                  htmlFor="email"
                  style={{ display: 'block', fontSize: 13, marginBottom: 4 }}
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #ccc',
                    fontSize: 16,
                    boxSizing: 'border-box',
                  }}
                  disabled={status === 'loading'}
                />
                {status === 'rate_limited' && (
                  <p style={{ color: '#a23', fontSize: 13, margin: '8px 0 0 0' }}>
                    Too many requests. Please try again in an hour.
                  </p>
                )}
                {status === 'error' && (
                  <p style={{ color: '#a23', fontSize: 13, margin: '8px 0 0 0' }}>
                    Something went wrong. Please try again.
                  </p>
                )}
                <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                  <button
                    type="submit"
                    disabled={status === 'loading'}
                    style={{
                      background: '#f2682f',
                      color: 'white',
                      border: 'none',
                      borderRadius: 999,
                      padding: '10px 24px',
                      cursor: status === 'loading' ? 'wait' : 'pointer',
                      fontSize: 14,
                    }}
                  >
                    {status === 'loading' ? 'Sending…' : 'Send me a link'}
                  </button>
                  <button
                    type="button"
                    onClick={close}
                    style={{
                      background: 'transparent',
                      border: '1px solid #ccc',
                      borderRadius: 999,
                      padding: '10px 24px',
                      cursor: 'pointer',
                      fontSize: 14,
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
