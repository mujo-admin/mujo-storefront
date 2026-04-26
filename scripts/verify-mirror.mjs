// Quick read-back of what's in Stripe — products, prices, shipping rates.
// Useful after running mirror-shopify-to-stripe.ts to spot-check the result.

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const products = await stripe.products.list({ limit: 20 });
console.log(`Stripe Products (${products.data.length}):\n`);
for (const p of products.data) {
  const prices = await stripe.prices.list({ product: p.id, limit: 20, active: true });
  console.log(`  ${p.name} (${p.id})`);
  for (const price of prices.data) {
    const recurring = price.recurring
      ? `${price.recurring.interval_count} ${price.recurring.interval}`
      : 'one-time';
    console.log(
      `    - ${price.id} — $${(price.unit_amount / 100).toFixed(2)} ${recurring}`,
    );
  }
}

const shippingRates = await stripe.shippingRates.list({ active: true, limit: 10 });
console.log(`\nShipping rates (${shippingRates.data.length}):`);
for (const r of shippingRates.data) {
  console.log(
    `  ${r.id} — ${r.display_name} — $${(r.fixed_amount.amount / 100).toFixed(2)}`,
  );
}
