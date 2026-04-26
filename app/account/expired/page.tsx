// Thin error page for magic-link redemption failures. Tells the customer
// what went wrong in plain language and offers a retry path. Skinned roughly
// to brand v1.1; W3 will integrate this into the proper site shell.

type Props = {
  searchParams: Promise<{ reason?: string }>;
};

const REASON_COPY: Record<string, { title: string; body: string }> = {
  expired: {
    title: 'That link expired',
    body: 'Magic links last 15 minutes. Request a fresh one and you should be in within seconds.',
  },
  used: {
    title: 'That link was already used',
    body: 'For security, each link only works once. Request a new one and try again.',
  },
  invalid: {
    title: "That link doesn't look right",
    body: 'It may have been copied incorrectly or tampered with. Request a new one and try again.',
  },
  unknown: {
    title: "We couldn't find that link",
    body: 'It may have been already used or never issued. Request a new one and try again.',
  },
  missing: {
    title: 'Missing token',
    body: 'The link you followed is incomplete. Request a fresh magic link.',
  },
  stripe_error: {
    title: 'Stripe is unreachable',
    body: 'Try again in a moment. If this keeps happening, email us at hello@mujoworld.com.',
  },
};

export default async function AccountExpiredPage({ searchParams }: Props) {
  const { reason = 'unknown' } = await searchParams;
  const copy = REASON_COPY[reason] ?? REASON_COPY.unknown;
  if (!copy) return null;

  return (
    <main
      style={{
        minHeight: '70vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        backgroundColor: '#f5f0e6',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 520, width: '100%' }}>
        <h1
          style={{
            fontFamily: '"Instrument Serif", Georgia, serif',
            fontSize: 36,
            fontWeight: 400,
            color: '#0f0f0f',
            margin: '0 0 16px 0',
            lineHeight: 1.15,
          }}
        >
          {copy.title}
        </h1>
        <p style={{ fontSize: 16, color: '#0f0f0f', lineHeight: 1.5, margin: '0 0 24px 0' }}>
          {copy.body}
        </p>
        <a
          href="/account"
          style={{
            display: 'inline-block',
            backgroundColor: '#f2682f',
            color: '#ffffff',
            padding: '12px 24px',
            borderRadius: 999,
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          Request a new link
        </a>
      </div>
    </main>
  );
}
