// One-shot: ensure customer.subscription.created is in the staging
// webhook endpoint's enabled_events list. Re-runnable; idempotent.
//
// Required for the Loop migration zero-touch coupon attach handler at
// lib/webhook-handlers/subscription-created.ts to fire — Stripe only
// sends events for explicitly enabled types on V1 endpoints.

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import Stripe from 'stripe';

const TARGET_EVENT: Stripe.WebhookEndpointUpdateParams.EnabledEvent =
  'customer.subscription.created';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('STRIPE_SECRET_KEY missing from .env.local');
  process.exit(1);
}
const stripe = new Stripe(key, { apiVersion: '2026-04-22.dahlia' });

async function main() {
  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  console.log(`Found ${list.data.length} V1 webhook endpoints:`);
  for (const ep of list.data) {
    console.log(`  - ${ep.id} → ${ep.url}`);
    console.log(
      `    enabled_events (${ep.enabled_events.length}): ${ep.enabled_events.join(', ')}`,
    );
    console.log(`    status: ${ep.status}`);
  }

  if (list.data.length === 0) {
    console.error(
      '\nNo V1 webhook endpoints. Destination may be V2 (per memory project_stripe_v1_v2_webhook_split — V2 destinations are dashboard-only until v2/event-destinations SDK lands).',
    );
    return;
  }

  const targets = list.data.filter(
    (e) =>
      e.url.includes('mujo-storefront.vercel.app') ||
      e.url.includes('mujoworld.com'),
  );

  if (targets.length === 0) {
    console.error('\nNo Mujo storefront endpoints. URLs found above.');
    return;
  }

  for (const ep of targets) {
    if (ep.enabled_events.includes('*')) {
      console.log(
        `\n✓ ${ep.id} has wildcard "*" — ${TARGET_EVENT} already covered.`,
      );
      continue;
    }
    if (ep.enabled_events.includes(TARGET_EVENT)) {
      console.log(`\n✓ ${ep.id} already has ${TARGET_EVENT} — no update needed.`);
      continue;
    }
    console.log(`\nUpdating ${ep.id}...`);
    const updated = await stripe.webhookEndpoints.update(ep.id, {
      enabled_events: [
        ...ep.enabled_events,
        TARGET_EVENT,
      ] as Stripe.WebhookEndpointUpdateParams.EnabledEvent[],
    });
    console.log(
      `✓ Updated. New events (${updated.enabled_events.length}): ${updated.enabled_events.join(', ')}`,
    );
  }
}

main().catch((err) => {
  console.error('Failed:', err.message ?? err);
  process.exit(1);
});
