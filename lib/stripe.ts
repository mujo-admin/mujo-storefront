import Stripe from 'stripe';

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(secretKey, {
  apiVersion: '2026-04-22.dahlia',
  typescript: true,
  appInfo: {
    name: 'mujo-storefront',
    url: 'https://mujoworld.com',
  },
});
