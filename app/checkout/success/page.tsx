import Link from "next/link";
import type { Metadata } from "next";
import { stripe } from "lib/stripe";
import { CheckoutSuccessClient } from "./success-client";

export const metadata: Metadata = {
  title: "Order received",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function asString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CheckoutSuccessPage(props: {
  searchParams: SearchParams;
}) {
  const params = await props.searchParams;
  const sessionId = asString(params.session_id);
  const eventId = asString(params.event_id);

  let session: Awaited<
    ReturnType<typeof stripe.checkout.sessions.retrieve>
  > | null = null;
  if (sessionId) {
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['payment_intent'],
      });
    } catch (err) {
      console.error('[checkout/success] retrieve session failed', sessionId, err);
    }
  }

  // Mode-specific status read.
  // Hosted Checkout sets `payment_status` to "paid" / "unpaid" / "no_payment_required".
  // For subscriptions, "no_payment_required" can occur if a 100%-off coupon is applied.
  const paymentStatus = session?.payment_status ?? 'unknown';
  const status = session?.status ?? 'unknown';

  const isSucceeded =
    status === 'complete' &&
    (paymentStatus === 'paid' || paymentStatus === 'no_payment_required');
  const isProcessing =
    status === 'open' || (status === 'complete' && paymentStatus === 'unpaid');

  const amount = session?.amount_total ?? 0;
  const currency = (session?.currency ?? 'usd').toUpperCase();
  const email = session?.customer_details?.email ?? null;
  const mode = session?.mode ?? 'payment';

  return (
    <div className="success-shell">
      <div className="success-card">
        {isSucceeded ? (
          <>
            <div className="success-glyph" aria-hidden>
              ✓
            </div>
            <h1>Order received</h1>
            <p className="success-lede">
              Thanks{email ? `, we'll send the receipt to ${email}` : ", we'll send the receipt to your email"}.
            </p>
            <div className="success-amount">
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency,
              }).format(amount / 100)}
              {mode === 'subscription' ? (
                <span className="success-amount-suffix"> / month</span>
              ) : null}
            </div>
            <div className="success-actions">
              <Link href="/shop" className="success-btn">
                Keep shopping →
              </Link>
            </div>
            {mode === 'subscription' ? (
              <p className="success-sub-note">
                To manage your subscription anytime, use the "Manage
                subscription" link in the footer — we'll email you a secure
                login link.
              </p>
            ) : null}
            <p className="success-fineprint">
              Your ritual ships from our US warehouse within 1–2 business days.
              You'll receive a tracking email when it leaves the warehouse.
            </p>
          </>
        ) : isProcessing ? (
          <>
            <div className="success-glyph processing" aria-hidden>
              …
            </div>
            <h1>Payment processing</h1>
            <p className="success-lede">
              Your bank is taking a moment. We'll email you the moment it
              clears — usually within a few minutes.
            </p>
            <Link href="/" className="success-link">
              Back to home
            </Link>
          </>
        ) : (
          <>
            <div className="success-glyph error" aria-hidden>
              !
            </div>
            <h1>Payment didn't complete</h1>
            <p className="success-lede">
              We couldn't confirm the payment. Your card has not been charged.
            </p>
            <Link href="/checkout" className="success-btn">
              Try again
            </Link>
          </>
        )}
      </div>

      {session && isSucceeded ? (
        <CheckoutSuccessClient
          eventId={eventId ?? null}
          sessionId={session.id}
          amount={amount}
          currency={currency}
          email={email}
        />
      ) : null}

      <style>{`
        .success-shell {
          min-height: calc(100vh - 100px);
          background: var(--cream);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 64px 20px;
        }
        .success-card {
          max-width: 520px;
          width: 100%;
          background: var(--sand);
          border-radius: 14px;
          padding: 48px 36px;
          text-align: center;
          font-family: var(--f-body);
          color: var(--ink);
        }
        .success-glyph {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: var(--sage);
          color: #fff;
          font-size: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          font-family: var(--f-display);
        }
        .success-glyph.processing { background: var(--orange); }
        .success-glyph.error { background: #b91c1c; }
        .success-card h1 {
          font-family: var(--f-display);
          font-size: 26px;
          font-weight: 500;
          margin: 0 0 12px;
        }
        .success-lede {
          font-size: 15px;
          color: var(--ink-soft);
          line-height: 1.5;
          margin: 0 0 18px;
        }
        .success-amount {
          font-family: var(--f-mono);
          font-size: 22px;
          color: var(--ink);
          margin: 16px 0 24px;
          letter-spacing: 0.02em;
        }
        .success-amount-suffix {
          font-size: 14px;
          color: var(--mute);
          letter-spacing: 0;
          margin-left: 4px;
        }
        .success-actions {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          margin-top: 18px;
        }
        .success-btn {
          background: var(--orange);
          color: #fff;
          text-decoration: none;
          padding: 13px 28px;
          border-radius: 100px;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.2s;
        }
        .success-btn:hover { background: var(--orange-deep); }
        .success-link {
          font-family: var(--f-mono);
          font-size: 12px;
          color: var(--ink-soft);
          letter-spacing: 0.04em;
          text-decoration: none;
        }
        .success-link:hover { color: var(--orange-deep); }
        .success-fineprint {
          margin-top: 28px;
          padding-top: 18px;
          border-top: 1px solid var(--line);
          font-family: var(--f-mono);
          font-size: 11px;
          color: var(--mute);
          letter-spacing: 0.04em;
          line-height: 1.5;
        }
        .success-sub-note {
          margin: 18px auto 0;
          max-width: 380px;
          font-size: 13px;
          color: var(--ink-soft);
          line-height: 1.55;
        }
        @media (max-width: 600px) {
          .success-shell { padding: 32px 14px; }
          .success-card { padding: 32px 22px; }
        }
      `}</style>
    </div>
  );
}
