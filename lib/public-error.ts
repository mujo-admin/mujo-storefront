import Stripe from 'stripe';

/**
 * The message it is safe to show a customer for a Stripe error.
 *
 * Card errors (declined, expired, wrong CVC) are written by Stripe for the
 * cardholder, so they pass through. Anything else is an internal problem whose
 * text can carry object ids (cus_…, sub_…, pm_…) and account details: the
 * customer gets a plain line, the detail stays in the server log.
 */
export function publicStripeMessage(err: InstanceType<typeof Stripe.errors.StripeError>): string {
  if (err instanceof Stripe.errors.StripeCardError && err.message) return err.message;
  return "Something went wrong on our side. Please try again, or email hello@mujoworld.com and we'll sort it.";
}
