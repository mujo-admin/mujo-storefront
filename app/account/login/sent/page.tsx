import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Check your email",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function asString(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function LoginSentPage(props: {
  searchParams: SearchParams;
}) {
  const params = await props.searchParams;
  const email = asString(params.email);

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-glyph" aria-hidden>
          ✓
        </div>
        <h1 className="login-title">
          Check your <em>inbox</em>
        </h1>
        <p className="login-lede">
          {email ? (
            <>
              If <strong>{email}</strong> is on file, your login link is
              landing in the next minute or two.
            </>
          ) : (
            <>
              If your email is on file, your login link is landing in the next
              minute or two.
            </>
          )}{" "}
          The link works for 7 days.
        </p>

        <div className="login-fineprint">
          <p>
            Don&rsquo;t see it? Check your spam or promotions tab. The sender
            is <strong>hello@mujoworld.com</strong>.
          </p>
          <Link href="/account/login" className="login-back">
            ← Try a different email
          </Link>
        </div>
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
          background: var(--sage);
          color: #fff;
          font-size: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          font-family: var(--f-display);
        }
        .login-title {
          font-family: var(--f-display);
          font-size: 26px;
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
        .login-fineprint {
          padding-top: 18px;
          border-top: 1px solid var(--line);
          font-size: 13px;
          color: var(--mute);
          line-height: 1.5;
        }
        .login-fineprint p { margin: 0 0 14px; }
        .login-back {
          font-family: var(--f-mono);
          font-size: 12px;
          color: var(--ink-soft);
          letter-spacing: 0.04em;
          text-decoration: none;
        }
        .login-back:hover { color: var(--orange-deep); }
        @media (max-width: 600px) {
          .login-shell { padding: 32px 14px; }
          .login-card { padding: 28px 22px; }
          .login-title { font-size: 22px; }
        }
      `}</style>
    </div>
  );
}
