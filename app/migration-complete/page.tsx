// /migration-complete — Stripe redirects here after a Loop migration
// customer completes their re-confirm Payment Link checkout. Confirms the
// migration succeeded, hands them off to /account/login with their email
// pre-filled.
//
// Stripe substitutes {CHECKOUT_SESSION_ID} into the redirect URL — we
// retrieve the session server-side to confirm payment + extract the
// customer email so the login link button is one-click (no re-typing).

import type { Metadata } from "next";
import Link from "next/link";
import Stripe from "stripe";
import { stripe } from "lib/stripe";

export const metadata: Metadata = {
  title: "Welcome back to Mujo",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = { [k: string]: string | string[] | undefined };

export default async function MigrationCompletePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const rawSessionId = Array.isArray(params.session_id)
    ? params.session_id[0]
    : params.session_id;

  let customerEmail: string | null = null;
  let paymentStatus: Stripe.Checkout.Session["payment_status"] | null = null;

  if (rawSessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(rawSessionId);
      customerEmail =
        session.customer_details?.email ?? session.customer_email ?? null;
      paymentStatus = session.payment_status;
    } catch (err) {
      console.error("[migration-complete] session retrieve failed", err);
    }
  }

  // Common case: payment_status === 'paid' for a successful re-confirm.
  // Other states ('unpaid', 'no_payment_required') don't arrive here in
  // practice — Stripe wouldn't redirect on incomplete payment — but the
  // status banner is still rendered honestly for visibility.
  const succeeded = paymentStatus === "paid" || paymentStatus === "no_payment_required";

  const loginHref = customerEmail
    ? `/account/login?email=${encodeURIComponent(customerEmail)}`
    : "/account/login";

  return (
    <div className="mig-shell">
      <div className="mig-card">
        <div className="mig-eyebrow">Migration · complete</div>
        <h1 className="mig-title">
          Welcome <em>back</em> to Mujo.
        </h1>

        {succeeded ? (
          <p className="mig-lede">
            Your subscription is now on Mujo&rsquo;s new system.
            {customerEmail ? (
              <>
                {" "}We sent a Stripe receipt to{" "}
                <strong>{customerEmail}</strong>. Your next renewal stays on
                its scheduled date — no double charges.
              </>
            ) : (
              <>
                {" "}We sent a Stripe receipt to your email. Your next renewal
                stays on its scheduled date — no double charges.
              </>
            )}
          </p>
        ) : (
          <p className="mig-lede">
            Thanks for migrating. Your subscription is being set up — give
            it a moment, then sign in below to confirm.
          </p>
        )}

        <div className="mig-info-card">
          <strong>You can now manage your subscription anytime.</strong>
          <p>
            Skip a delivery, swap sizes, pause, change your address, update
            your card — all in two taps from your Mujo account. Sign in
            with your email below — we&rsquo;ll send a one-tap login link
            to your inbox.
          </p>
        </div>

        <Link href={loginHref} className="mig-cta">
          Sign in to your account →
        </Link>

        <div className="mig-fineprint">
          <span>Questions?</span>{" "}
          <a href="mailto:hello@mujoworld.com">hello@mujoworld.com</a> ·
          we read every reply.
        </div>
      </div>

      <style>{`
        .mig-shell {
          min-height: calc(100vh - 100px);
          background: var(--cream);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 64px 20px;
          font-family: var(--f-body);
          color: var(--ink);
        }
        .mig-card {
          max-width: 540px;
          width: 100%;
          background: var(--sand);
          border-radius: 18px;
          padding: 44px 36px 32px;
        }
        .mig-eyebrow {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--orange-deep);
          font-weight: 500;
          margin-bottom: 12px;
        }
        .mig-title {
          font-family: var(--f-display);
          font-size: 32px;
          font-weight: 500;
          letter-spacing: -0.02em;
          margin: 0 0 16px;
          line-height: 1.1;
          color: var(--ink);
        }
        .mig-title em {
          font-family: var(--f-serif);
          font-style: italic;
          color: var(--orange);
          font-weight: 400;
        }
        .mig-lede {
          font-size: 15px;
          color: var(--ink-soft);
          line-height: 1.55;
          margin: 0 0 24px;
        }
        .mig-info-card {
          background: var(--cream);
          border-radius: 12px;
          padding: 18px 20px;
          margin-bottom: 24px;
        }
        .mig-info-card strong {
          display: block;
          font-family: var(--f-display);
          font-size: 16px;
          font-weight: 500;
          margin-bottom: 6px;
          color: var(--ink);
          letter-spacing: -0.01em;
        }
        .mig-info-card p {
          margin: 0;
          font-size: 14px;
          color: var(--ink-soft);
          line-height: 1.55;
        }
        .mig-cta {
          display: inline-block;
          background: var(--orange);
          color: #fff;
          text-decoration: none;
          padding: 14px 28px;
          border-radius: 100px;
          font-family: var(--f-body);
          font-size: 15px;
          font-weight: 500;
          transition: background 0.15s;
          margin-bottom: 22px;
        }
        .mig-cta:hover { background: var(--orange-deep); }
        .mig-fineprint {
          font-size: 12px;
          color: var(--mute);
          line-height: 1.55;
          font-family: var(--f-mono);
          letter-spacing: 0.04em;
        }
        .mig-fineprint a {
          color: var(--ink-soft);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .mig-fineprint a:hover { color: var(--orange-deep); }
        @media (max-width: 600px) {
          .mig-shell { padding: 32px 14px; }
          .mig-card { padding: 32px 24px 24px; }
          .mig-title { font-size: 26px; }
        }
      `}</style>
    </div>
  );
}
