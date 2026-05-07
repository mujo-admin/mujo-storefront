import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "lib/session";
import { LogoutButton } from "./logout-button";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) {
    redirect("/account/login");
  }

  return (
    <div className="account-shell">
      <div className="account-card">
        <div className="account-eyebrow">SIGNED IN</div>
        <h1 className="account-title">
          Welcome <em>back</em>
        </h1>
        <p className="account-lede">
          You&rsquo;re signed in as <strong>{session.email}</strong>.
        </p>

        <div className="account-placeholder">
          <p>
            Your account dashboard &mdash; orders, subscription, profile,
            payment method &mdash; is being built. Until it&rsquo;s ready,
            you can manage your subscription via the link below.
          </p>
          <a
            href="#manage-subscription"
            className="account-link"
          >
            Manage subscription →
          </a>
        </div>

        <LogoutButton />
      </div>

      <style>{`
        .account-shell {
          min-height: calc(100vh - 100px);
          background: var(--cream);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 64px 20px;
        }
        .account-card {
          max-width: 540px;
          width: 100%;
          background: var(--sand);
          border-radius: 18px;
          padding: 40px 32px 32px;
          font-family: var(--f-body);
          color: var(--ink);
        }
        .account-eyebrow {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.12em;
          color: var(--mute);
          margin-bottom: 12px;
        }
        .account-title {
          font-family: var(--f-display);
          font-size: 30px;
          font-weight: 500;
          letter-spacing: -0.01em;
          margin: 0 0 12px;
          line-height: 1.2;
        }
        .account-title em {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
          color: var(--orange-deep);
          font-weight: 400;
        }
        .account-lede {
          font-size: 15px;
          color: var(--ink-soft);
          line-height: 1.55;
          margin: 0 0 24px;
        }
        .account-placeholder {
          background: var(--cream);
          border-radius: 12px;
          padding: 22px;
          margin-bottom: 22px;
        }
        .account-placeholder p {
          margin: 0 0 14px;
          font-size: 14px;
          color: var(--ink-soft);
          line-height: 1.5;
        }
        .account-link {
          font-family: var(--f-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
          color: var(--orange-deep);
          text-decoration: none;
        }
        .account-link:hover { color: var(--orange); }
        @media (max-width: 600px) {
          .account-shell { padding: 32px 14px; }
          .account-card { padding: 28px 22px; }
          .account-title { font-size: 24px; }
        }
      `}</style>
    </div>
  );
}
