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
  const piId = asString(params.payment_intent);
  const eventId = asString(params.event_id);

  let pi: Awaited<ReturnType<typeof stripe.paymentIntents.retrieve>> | null = null;
  if (piId) {
    try {
      pi = await stripe.paymentIntents.retrieve(piId);
    } catch (err) {
      console.error("[checkout/success] retrieve PI failed", piId, err);
    }
  }

  const status = pi?.status ?? "unknown";
  const amount = pi?.amount ?? 0;
  const currency = (pi?.currency ?? "usd").toUpperCase();
  const email = pi?.receipt_email ?? null;

  return (
    <div className="success-shell">
      <div className="success-card">
        {status === "succeeded" ? (
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
            </div>
            <div className="success-actions">
              <Link href="/account/login" className="success-btn">
                Create an account →
              </Link>
              <Link href="/shop" className="success-link">
                Keep shopping
              </Link>
            </div>
            <p className="success-fineprint">
              Your ritual ships from our US warehouse within 1–2 business days.
              You'll receive a tracking email when it leaves the warehouse.
            </p>
          </>
        ) : status === "processing" ? (
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

      {pi && status === "succeeded" ? (
        <CheckoutSuccessClient
          eventId={eventId ?? null}
          paymentIntentId={pi.id}
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
        @media (max-width: 600px) {
          .success-shell { padding: 32px 14px; }
          .success-card { padding: 32px 22px; }
        }
      `}</style>
    </div>
  );
}
