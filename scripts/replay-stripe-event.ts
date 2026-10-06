// Feed a SANDBOX Stripe event to the real webhook handlers, locally.
//
//   pnpm tsx scripts/replay-stripe-event.ts evt_123
//   pnpm tsx scripts/replay-stripe-event.ts --latest invoice.paid
//   pnpm tsx scripts/replay-stripe-event.ts --for ch_123        (newest event about that object)
//
// Why: Vercel previews cannot receive sandbox webhooks, so this is how the
// order-mirror code is proven before a merge. It runs the same handler the
// webhook route dispatches to, against the sandbox Stripe key in .env.local.
// It skips the webhook_events idempotency table; the handlers' own
// order_mirror guards still apply (so replaying twice must not duplicate).
//
// Refuses to run against a live key. Klaviyo + Meta are switched off unless
// --with-analytics is passed, so test orders never reach real reporting.
//
// NOTE: the handlers write to whatever database .env.local points at, and
// create real (test-flagged) orders in the Shopify store. Use a dedicated test
// email and clean up afterwards (scripts/sandbox-order-scenarios.ts cleanup).

import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const args = process.argv.slice(2);
  if (!process.env.STRIPE_SECRET_KEY?.startsWith('sk_test')) {
    throw new Error('Refusing to run: STRIPE_SECRET_KEY is not a sandbox (sk_test) key.');
  }
  if (!args.includes('--with-analytics')) {
    delete process.env.KLAVIYO_PRIVATE_API_KEY;
    delete process.env.KLAVIYO_PRIVATE_KEY;
    delete process.env.META_CONVERSIONS_API_TOKEN;
  }

  const { stripe } = await import('lib/stripe');
  const { handleCheckoutCompleted } = await import('lib/webhook-handlers/checkout-completed');
  const { handleInvoicePaid } = await import('lib/webhook-handlers/invoice-paid');
  const { handlePaymentIntentSucceeded } = await import(
    'lib/webhook-handlers/payment-intent-succeeded'
  );
  const { handleChargeRefunded } = await import('lib/webhook-handlers/charge-refunded');

  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };

  let event;
  const latestType = flag('--latest');
  const forObject = flag('--for');
  const eventId = args.find((a) => a.startsWith('evt_'));
  if (eventId) {
    event = await stripe.events.retrieve(eventId);
  } else if (latestType) {
    event = (await stripe.events.list({ type: latestType, limit: 1 })).data[0];
  } else if (forObject) {
    const wanted = flag('--type');
    const recent = await stripe.events.list({ limit: 100, ...(wanted ? { type: wanted } : {}) });
    event = recent.data.find((e) => JSON.stringify(e.data.object).includes(forObject));
  }
  if (!event) throw new Error('No matching event. Pass evt_…, --latest <type>, or --for <id>.');

  console.log(`→ replaying ${event.type} ${event.id}`);
  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event);
      break;
    case 'invoice.paid':
      await handleInvoicePaid(event);
      break;
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event);
      break;
    case 'charge.refunded':
      await handleChargeRefunded(event);
      break;
    default:
      throw new Error(`No replay handler wired for ${event.type}`);
  }
  console.log('✓ handler finished');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
