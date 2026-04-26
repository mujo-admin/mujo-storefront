import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const DEST_ID = 'we_1TQXOlLCOtv4ffBjeRhoa5vP';

console.log('=== Direct retrieve by ID ===');
try {
  const ep = await stripe.webhookEndpoints.retrieve(DEST_ID);
  console.log(`  ✓ Endpoint exists in V1 API`);
  console.log(`  URL: ${ep.url}`);
  console.log(`  Status: ${ep.status}`);
  console.log(`  Events (${ep.enabled_events.length}): ${ep.enabled_events.join(', ')}`);
  console.log(`  Live mode: ${ep.livemode}`);
  console.log(`  API version: ${ep.api_version}`);
  console.log(`  Created: ${new Date(ep.created * 1000).toISOString()}`);
} catch (err) {
  console.error(`  ✗ ${err.message}`);
}

console.log('\n=== List with all options ===');
const list = await stripe.webhookEndpoints.list({ limit: 100 });
console.log(`  Total via list(): ${list.data.length}`);
console.log(`  Has more: ${list.has_more}`);
for (const ep of list.data) {
  console.log(`    ${ep.id} | ${ep.status} | ${ep.url}`);
}

console.log('\n=== Latest 3 events delivery status ===');
const events = await stripe.events.list({ limit: 3 });
for (const e of events.data) {
  console.log(`  ${e.id} | ${e.type} | pending: ${e.pending_webhooks}`);
}
