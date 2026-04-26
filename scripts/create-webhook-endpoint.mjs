// Programmatically create a V1 webhook endpoint pointed at our Vercel route.
// Stripe's new dashboard "Event destinations" UI creates V2 destinations that
// don't fire on traditional V1 events — our handlers expect V1. Bypass the UI.

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const URL = 'https://mujo-storefront.vercel.app/api/webhooks/stripe';
const EVENTS = [
  'checkout.session.completed',
  'invoice.paid',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'charge.failed',
  'charge.refunded',
];

console.log(`→ Creating V1 webhook endpoint…`);
console.log(`  URL: ${URL}`);
console.log(`  Events (${EVENTS.length}): ${EVENTS.join(', ')}`);

const ep = await stripe.webhookEndpoints.create({
  url: URL,
  enabled_events: EVENTS,
  description: 'Mujo Storefront staging — V1 events (created via API)',
});

console.log(`\n✓ Created`);
console.log(`  ID: ${ep.id}`);
console.log(`  Secret: ${ep.secret}`);
console.log(`  Status: ${ep.status}`);
console.log(`  API version: ${ep.api_version ?? 'account default'}`);
console.log(`\n→ Updating env...`);

import { readFileSync, writeFileSync } from 'node:fs';
const envPath = '.env.local';
const envContent = readFileSync(envPath, 'utf-8');
const updated = envContent.replace(
  /^STRIPE_WEBHOOK_SECRET=.*$/m,
  `STRIPE_WEBHOOK_SECRET=${ep.secret}`,
);
writeFileSync(envPath, updated);
console.log(`✓ STRIPE_WEBHOOK_SECRET updated in .env.local`);

console.log(`\n→ Next: push to Vercel + redeploy + re-run stripe trigger`);
