// Resend smoke test: API key + domain verification + Workspace coexistence.
// Sends a test email from hello@mujoworld.com to kinga@mujoworld.com.
// If it lands in the Workspace inbox, MX coexistence works (Resend on
// send.mujoworld.com subdomain, Workspace on root).
//
// Usage: node --env-file=.env.local scripts/resend-smoke.mjs

import { Resend } from 'resend';

if (!process.env.RESEND_API_KEY) {
  console.error('RESEND_API_KEY not set');
  process.exit(1);
}

const FROM = process.env.RESEND_FROM_EMAIL ?? 'hello@mujoworld.com';
const TO = process.argv[2] ?? 'kinga@mujoworld.com';

const resend = new Resend(process.env.RESEND_API_KEY);

const result = await resend.emails.send({
  from: FROM,
  to: TO,
  subject: 'Resend smoke test — W2 setup',
  html: `
<!DOCTYPE html>
<html>
<body style="font-family: system-ui, sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px; color: #0f0f0f; background: #f5f0e6;">
  <h1 style="font-family: Georgia, serif; font-weight: 400; font-size: 24px;">Mujo Storefront — Resend smoke test</h1>
  <p>If this email arrived in your inbox, three things are confirmed:</p>
  <ol>
    <li>Resend API key is valid</li>
    <li><b>mujoworld.com</b> is verified as a sending domain</li>
    <li>Subdomain MX (<code>send.mujoworld.com</code>) coexists with Google Workspace MX on the root — Workspace mail to <code>kinga@mujoworld.com</code> is unaffected</li>
  </ol>
  <p style="font-size: 14px; color: #666;">Sent at ${new Date().toISOString()} from W2 setup script.</p>
</body>
</html>
  `.trim(),
});

if (result.error) {
  console.error('✗ Resend send failed:');
  console.error(JSON.stringify(result.error, null, 2));
  process.exit(1);
}

console.log('✓ Resend send queued.');
console.log(`  Email ID: ${result.data?.id}`);
console.log(`  From: ${FROM}`);
console.log(`  To: ${TO}`);
console.log('\nCheck the Workspace inbox in 10–30 seconds.');
console.log('If it arrives, paste back: "smoke test received"');
console.log('If it does NOT arrive within 2 min, MX coexistence may have failed —');
console.log('check Resend dashboard → Emails for delivery status.');
