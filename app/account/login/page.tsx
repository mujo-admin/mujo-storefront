import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="login-shell">
      <div className="login-card">
        <h1 className="login-title">
          Welcome <em>back</em>
        </h1>
        <p className="login-lede">
          Sign in to manage your subscription, see your orders, and update
          your details. We&rsquo;ll send a one-time link to your inbox &mdash;
          no password required.
        </p>
        <LoginForm />
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
        @media (max-width: 600px) {
          .login-shell { padding: 32px 14px; }
          .login-card { padding: 28px 22px; }
          .login-title { font-size: 24px; }
        }
      `}</style>
    </div>
  );
}
