import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

console.log('=== Recent Stripe events (test mode) ===');
const events = await stripe.events.list({ limit: 5 });
for (const e of events.data) {
  const date = new Date(e.created * 1000).toISOString();
  console.log(`  ${date} | ${e.type.padEnd(40)} | ${e.id}`);
}

console.log('\n=== Webhook endpoints registered ===');
const endpoints = await stripe.webhookEndpoints.list({ limit: 10 });
for (const ep of endpoints.data) {
  console.log(`  ${ep.id} | ${ep.status} | ${ep.url}`);
  console.log(`    Events: ${ep.enabled_events.length} subscribed`);
  console.log(`    Created: ${new Date(ep.created * 1000).toISOString()}`);
}
