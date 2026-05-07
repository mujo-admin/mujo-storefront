import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign-in link error",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function asString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

const REASON_COPY: Record<string, { title: string; body: string }> = {
  invalid: {
    title: "Link not valid",
    body: "That sign-in link is malformed or has been altered. Request a new one — it'll land in your inbox in a minute.",
  },
  expired: {
    title: "Link expired",
    body: "Sign-in links expire after 7 days. Request a fresh one and it'll land in your inbox in a minute.",
  },
  used: {
    title: "Link already used",
    body: "That sign-in link has already been redeemed. Request a fresh one — links are single-use for security.",
  },
  unknown: {
    title: "Something's off",
    body: "We couldn't process that sign-in link. Request a fresh one and try again.",
  },
};

export default async function LoginErrorPage(props: {
  searchParams: SearchParams;
}) {
  const params = await props.searchParams;
  const reason = asString(params.reason) ?? "unknown";
  const copy = REASON_COPY[reason] ?? {
    title: "Something's off",
    body: "We couldn't process that sign-in link. Request a fresh one and try again.",
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-glyph" aria-hidden>
          !
        </div>
        <h1 className="login-title">{copy.title}</h1>
        <p className="login-lede">{copy.body}</p>
        <Link href="/account/login" className="login-cta">
          Request a new link →
        </Link>
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
          text-align: center;
        }
        .login-glyph {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: var(--orange);
          color: #fff;
          font-size: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          font-family: var(--f-display);
          font-weight: 600;
        }
        .login-title {
          font-family: var(--f-display);
          font-size: 24px;
          font-weight: 500;
          letter-spacing: -0.01em;
          margin: 0 0 12px;
          line-height: 1.2;
        }
        .login-lede {
          font-size: 14px;
          color: var(--ink-soft);
          line-height: 1.55;
          margin: 0 0 24px;
        }
        .login-cta {
          display: inline-block;
          background: var(--orange);
          color: #fff;
          text-decoration: none;
          padding: 13px 26px;
          border-radius: 100px;
          font-size: 14px;
          font-weight: 500;
          transition: background 0.15s;
        }
        .login-cta:hover { background: var(--orange-deep); }
        @media (max-width: 600px) {
          .login-shell { padding: 32px 14px; }
          .login-card { padding: 28px 22px; }
        }
      `}</style>
    </div>
  );
}
