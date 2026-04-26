// scripts/migrate-existing-subscribers.ts
//
// Sends a personalized re-opt-in email to each subscriber currently active on
// the old subscription system (Loop / Skio). Each email contains a per-customer
// migration link that pre-populates a Stripe Checkout Session with the
// subscription price + the customer's email.
//
// Usage (after Handoff #10 — CSV exported):
//   pnpm tsx --env-file=.env.local \
//     scripts/migrate-existing-subscribers.ts \
//     --csv ~/Downloads/loop-active-subs-2026-04-XX.csv \
//     [--dry-run] [--batch-size 10] [--delay-ms 1000]
//
// CSV columns required: email, first_name, last_name, subscription_plan, next_charge_date
//
// On success: writes a manifest CSV next to the input listing each email's
// status (queued, sent, error, skipped). Idempotent across runs — reads the
// manifest and skips already-sent rows on rerun.

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { Resend } from 'resend';

const args = parseArgs(process.argv.slice(2));
if (!args.csv) {
  console.error('Usage: --csv <path> [--dry-run] [--batch-size N] [--delay-ms N]');
  process.exit(1);
}

if (!process.env.RESEND_API_KEY) {
  console.error('RESEND_API_KEY not set');
  process.exit(1);
}

const FROM = process.env.RESEND_FROM_EMAIL ?? 'hello@mujoworld.com';
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mujoworld.com').replace(/\/$/, '');
const BATCH_SIZE = Number(args['batch-size'] ?? 10);
const DELAY_MS = Number(args['delay-ms'] ?? 1000);
const DRY = Boolean(args['dry-run']);

const resend = new Resend(process.env.RESEND_API_KEY);

type Row = {
  email: string;
  firstName: string;
  lastName: string;
  plan: string;
  nextChargeDate: string;
};

type ManifestRow = Row & { status: 'queued' | 'sent' | 'skipped' | 'error'; resendId?: string; error?: string };

const inputPath = resolve(args.csv);
const manifestPath = resolve(
  dirname(inputPath),
  basename(inputPath, '.csv') + '.manifest.csv',
);

console.log(`Input: ${inputPath}`);
console.log(`Manifest: ${manifestPath}`);
console.log(`Mode: ${DRY ? 'DRY RUN (no emails sent)' : 'LIVE'}`);
console.log(`From: ${FROM}`);

async function main() {
  const rows = parseCsv(readFileSync(inputPath, 'utf-8'));
  console.log(`Loaded ${rows.length} subscribers\n`);

  const sent = new Set<string>();
  if (existsSync(manifestPath)) {
    const prev = parseCsv(readFileSync(manifestPath, 'utf-8'));
    for (const r of prev) {
      if ('status' in r && r.status === 'sent') sent.add(r.email);
    }
    console.log(`Resuming — ${sent.size} already-sent emails will be skipped\n`);
  }

  const manifest: ManifestRow[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    console.log(
      `\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(rows.length / BATCH_SIZE)}`,
    );

    for (const row of batch) {
      if (sent.has(row.email)) {
        console.log(`  ↷ ${row.email} (already sent)`);
        manifest.push({ ...row, status: 'skipped' });
        continue;
      }

      if (DRY) {
        console.log(`  · ${row.email} (dry run)`);
        manifest.push({ ...row, status: 'queued' });
        continue;
      }

      try {
        const result = await resend.emails.send({
          from: FROM,
          to: row.email,
          subject: 'Your Mujo Ritual subscription — quick action needed',
          html: renderMigrationEmail(row),
        });
        if (result.error) throw new Error(result.error.message);
        console.log(`  ✓ ${row.email} (${result.data?.id})`);
        manifest.push({ ...row, status: 'sent', resendId: result.data?.id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ ${row.email}: ${msg}`);
        manifest.push({ ...row, status: 'error', error: msg });
      }
    }

    if (i + BATCH_SIZE < rows.length) await sleep(DELAY_MS);
    // Persist manifest after every batch so a crash doesn't lose progress.
    writeFileSync(manifestPath, serializeCsv(manifest));
  }

  writeFileSync(manifestPath, serializeCsv(manifest));
  console.log(`\nDone. Manifest written to ${manifestPath}`);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

// --- helpers ---------------------------------------------------------------

function renderMigrationEmail(row: Row): string {
  const greeting = row.firstName ? `Hi ${row.firstName},` : 'Hi,';
  const link = `${SITE_URL}/migrate?email=${encodeURIComponent(row.email)}`;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: system-ui, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px; color: #0f0f0f; background: #f5f0e6;">
  <h1 style="font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; font-size: 28px; line-height: 1.2; margin: 0 0 16px 0;">
    Your Mujo Ritual subscription — quick action needed
  </h1>
  <p style="font-size: 16px; line-height: 1.5;">${greeting}</p>
  <p style="font-size: 16px; line-height: 1.5;">
    We're upgrading our checkout so you get a smoother, faster experience. To keep your monthly Ritual flowing,
    we need you to re-confirm in two minutes.
  </p>
  <p style="text-align: center; margin: 32px 0;">
    <a href="${link}" style="display: inline-block; background: #f2682f; color: white; padding: 14px 28px; border-radius: 999px; text-decoration: none; font-weight: 600;">
      Continue my subscription
    </a>
  </p>
  <p style="font-size: 14px; color: #555; line-height: 1.5;">
    Your card will not be charged today — this only re-establishes your subscription on our new system.
    Your next renewal will continue on ${row.nextChargeDate} as before.
  </p>
  <p style="font-size: 13px; color: #777; margin-top: 24px;">
    Questions? Reply to this email or reach us at <a href="mailto:hello@mujoworld.com">hello@mujoworld.com</a>.
  </p>
  <p style="font-size: 12px; color: #999; margin-top: 24px;">Mujo Co. — modern performance without the crash.</p>
</body>
</html>
  `.trim();
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = 'true';
      }
    }
  }
  return out;
}

function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headerLine = lines[0];
  if (!headerLine) return [];
  const header = headerLine.split(',').map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const idx = (key: string) => header.indexOf(key);

  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const get = (k: string) => {
      const i = idx(k);
      return i >= 0 ? (cols[i] ?? '').trim() : '';
    };
    return {
      email: get('email').toLowerCase(),
      firstName: get('first_name'),
      lastName: get('last_name'),
      plan: get('subscription_plan') || get('plan'),
      nextChargeDate: get('next_charge_date') || get('next_renewal_date') || '',
    };
  });
}

function splitCsvLine(line: string): string[] {
  // Tiny CSV splitter handling quoted commas. Not RFC-perfect but sufficient
  // for the Loop/Skio export shape.
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
      continue;
    }
    if (c === ',' && !inQ) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function serializeCsv(rows: ManifestRow[]): string {
  const header = [
    'email',
    'firstName',
    'lastName',
    'plan',
    'nextChargeDate',
    'status',
    'resendId',
    'error',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.email,
        r.firstName,
        r.lastName,
        r.plan,
        r.nextChargeDate,
        r.status,
        r.resendId ?? '',
        (r.error ?? '').replace(/[,\n]/g, ' '),
      ]
        .map((v) => (v.includes(',') ? `"${v}"` : v))
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
