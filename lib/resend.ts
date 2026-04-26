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
export const RESEND_FROM = process.env.RESEND_FROM_EMAIL ?? 'hello@mujoworld.com';
