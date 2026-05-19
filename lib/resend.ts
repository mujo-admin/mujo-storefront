import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  throw new Error('RESEND_API_KEY is not set');
}

export const resend = new Resend(apiKey);

// Customer-facing transactional email sends from mujoworld.com (NOT mujo.life)
// — the domain customers see in their browser. mujo.life is retained only for
// Kinga's personal email + Resend account login. See memory:
// project_email_sending_domain.md
//
// Format is RFC 5322 mailbox-with-display-name so Gmail shows "Mujo" as the
// sender name + can render a brand avatar if Gravatar/BIMI is configured later.
// Without the display name, Gmail shows the local part ("hello") as the sender,
// which looks generic/spammy.
const FROM_DEFAULT = 'Mujo <hello@mujoworld.com>';
const FROM_ENV = process.env.RESEND_FROM_EMAIL?.trim();
export const RESEND_FROM =
  FROM_ENV && FROM_ENV.includes('<')
    ? FROM_ENV
    : FROM_ENV
      ? `Mujo <${FROM_ENV}>`
      : FROM_DEFAULT;

/**
 * Append `· HH:MM` (UTC) to a transactional email subject so each send has a
 * unique subject. Gmail conversation view threads emails by sender + subject,
 * so static subjects mean every magic-link / email-change verification
 * collapses into one thread with the OLDEST expanded by default — customers
 * see and tap stale links. Per-minute uniqueness breaks threading while staying
 * readable in the inbox preview.
 */
export function uniqueSubject(base: string): string {
  const ts = new Date().toISOString().slice(11, 16); // HH:MM UTC
  return `${base} · ${ts}`;
}
