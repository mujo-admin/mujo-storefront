// Handler: charge.failed
//
// Logs the failure for monitoring. The actual subscription status transition
// to past_due happens via customer.subscription.updated (Stripe automatically
// updates the subscription status when a renewal charge fails).
//
// Dahlia API change note: charge.invoice was removed. The lookup path
// charge → invoice → subscription that the original plan described is no
// longer cheap. Instead, we let customer.subscription.updated do the work,
// and use this handler purely for logging + alerting.

import type Stripe from 'stripe';

export async function handleChargeFailed(event: Stripe.Event) {
  if (event.type !== 'charge.failed') return;
  const charge = event.data.object;

  console.log('[charge.failed]', {
    charge: charge.id,
    amount: charge.amount,
    currency: charge.currency,
    failureCode: charge.failure_code,
    failureMessage: charge.failure_message,
    customer: typeof charge.customer === 'string' ? charge.customer : charge.customer?.id,
  });

  // Status transition to past_due happens in customer.subscription.updated.
  // Future: emit an alert here if Sentry/Slack is wired up.
}
