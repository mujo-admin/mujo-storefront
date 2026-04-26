import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Stripe split webhook destinations into V1 (legacy webhookEndpoints) and V2
// (event destinations under V2.core.eventDestinations). The new dashboard
// creates V2 destinations, which the legacy API can't see.

console.log('=== V2 Event Destinations ===');
try {
  const dests = await stripe.v2.core.eventDestinations.list({ limit: 20 });
  if (!dests.data || dests.data.length === 0) {
    console.log('  (none found via V2 API either)');
  } else {
    for (const d of dests.data) {
      console.log(`  ${d.id} | ${d.status ?? '?'} | type=${d.type}`);
      if (d.webhook_endpoint) {
        console.log(`    URL: ${d.webhook_endpoint.url ?? 'n/a'}`);
        console.log(`    Signing secret: ${d.webhook_endpoint.signing_secret ? 'set' : 'NOT set'}`);
      }
      console.log(`    Events: ${(d.enabled_events || []).join(', ').slice(0, 200)}`);
      console.log(`    Created: ${new Date(d.created * 1000).toISOString()}`);
    }
  }
} catch (err) {
  console.error('V2 API error:', err.message);
}

// Also check delivery attempts for the recent event
console.log('\n=== Delivery attempts for recent checkout.session.completed ===');
try {
  const eventId = 'evt_1TQXZEPxZ7KKqbmlN8SIOlqc';
  const event = await stripe.events.retrieve(eventId);
  console.log(`  Event: ${event.type} | created: ${new Date(event.created * 1000).toISOString()}`);
  console.log(`  Pending webhooks: ${event.pending_webhooks}`);
  console.log(`  Request: ${JSON.stringify(event.request)}`);
} catch (err) {
  console.error('  Error fetching event:', err.message);
}
