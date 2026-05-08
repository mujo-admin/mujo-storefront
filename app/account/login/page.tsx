import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = { [k: string]: string | string[] | undefined };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const reason = Array.isArray(params.reason) ? params.reason[0] : params.reason;
  const emailParam = Array.isArray(params.email) ? params.email[0] : params.email;
  const showEmailChangedBanner = reason === "email-changed";

  return (
    <div className="login-shell">
      <div className="login-card">
        {showEmailChangedBanner ? (
          <div className="login-banner">
            <strong>Email updated.</strong>
            <span>
              Sign in below using {emailParam ? <strong>{emailParam}</strong> : "your new address"}.
            </span>
          </div>
        ) : null}
        <h1 className="login-title">
          Welcome <em>back</em>
        </h1>
        <p className="login-lede">
          Sign in to manage your subscription, see your orders, and update
          your details. We&rsquo;ll send a one-time link to your inbox &mdash;
          no password required.
        </p>
        <LoginForm initialEmail={emailParam ?? ""} />
      </div>

      <style>{`
        .login-shell {
          min-height: calc(100vh - 100px);
          background: var(--cream);
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 64px 20px;
        }
        .login-card {
          max-width: 440px;
          width: 100%;
          background: var(--sand);
          border-radius: 18px;
          padding: 40px 32px 32px;
          font-family: var(--f-body);
          color: var(--ink);
        }
        .login-title {
          font-family: var(--f-display);
          font-size: 28px;
          font-weight: 500;
          letter-spacing: -0.01em;
          margin: 0 0 12px;
          line-height: 1.2;
        }
        .login-title em {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
          color: var(--orange-deep);
          font-weight: 400;
        }
        .login-lede {
          font-size: 14px;
          color: var(--ink-soft);
          line-height: 1.55;
          margin: 0 0 24px;
        }
        .login-banner {
          background: rgba(124, 167, 124, 0.12);
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 22px;
          font-size: 13px;
          color: #4d6f4d;
          line-height: 1.5;
        }
        .login-banner strong { display: block; margin-bottom: 2px; color: #3d5a3d; }
        @media (max-width: 600px) {
          .login-shell { padding: 32px 14px; }
          .login-card { padding: 28px 22px; }
          .login-title { font-size: 24px; }
        }
      `}</style>
    </div>
  );
}
