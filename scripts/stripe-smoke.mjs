// Quick Stripe connectivity smoke test.
// Usage: node --env-file=.env.local scripts/stripe-smoke.mjs

import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY not set in env');
  process.exit(1);
}

const s = new Stripe(process.env.STRIPE_SECRET_KEY);
const balance = await s.balance.retrieve();
const acct = await s.accounts.retrieve();

console.log('✓ Stripe API connected.');
console.log('  Mode:', process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'test' : 'live');
console.log('  Account:', acct.id, '(' + (acct.business_profile?.name || acct.email || 'no name') + ')');
console.log('  Country:', acct.country);
console.log('  Default currency:', acct.default_currency);
console.log(
  '  Charges enabled:',
  acct.charges_enabled ? 'yes' : 'no (verification still pending — ok for test mode)',
);
console.log(
  '  Available:',
  balance.available.map((a) => `${a.amount} ${a.currency}`).join(', ') || '0',
);
