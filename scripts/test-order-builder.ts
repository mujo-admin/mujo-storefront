// Arithmetic test for lib/shopify-order-builder.ts.
//   pnpm tsx scripts/test-order-builder.ts
// Exits non-zero on the first failure. No network, no env.

import assert from 'node:assert/strict';
import {
  buildOrderMoneyFields,
  cleanLineTitle,
  type OrderFacts,
} from '../lib/shopify-order-builder';

const IL = (amountCents: number) => [{ title: 'IL Sales Tax', ratePercent: 1.5, amountCents }];
const base = { currency: 'USD', chargeId: 'ch_test' };
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check('1. powder one-time: $45 + $5 shipping + $0.68 tax = $50.68', () => {
  const facts: OrderFacts = {
    ...base,
    totalCents: 5068,
    lines: [
      {
        title: 'Protein Powder',
        quantity: 1,
        subtotalCents: 4500,
        taxes: IL(68),
      },
    ],
    shipping: { title: 'Standard shipping', amountCents: 500, taxes: [] },
  };
  const b = buildOrderMoneyFields(facts, { isLive: true });
  assert.equal(b.matches, true);
  assert.equal(b.lineItems[0]?.priceSet?.shopMoney.amount, '45.00');
  assert.deepEqual(b.lineItems[0]?.taxLines, [
    {
      title: 'IL Sales Tax',
      rate: 0.015,
      priceSet: { shopMoney: { amount: '0.68', currencyCode: 'USD' } },
    },
  ]);
  assert.equal(b.shippingLines?.length, 1);
  assert.equal(b.shippingLines?.[0]?.priceSet.shopMoney.amount, '5.00');
  assert.equal(b.shippingLines?.[0]?.taxLines, undefined);
  assert.equal(b.transactions?.[0]?.amountSet.shopMoney.amount, '50.68');
  assert.equal(b.transactions?.[0]?.authorizationCode, 'ch_test');
  assert.equal(b.discountCode, undefined);
});

check('2. Ritual subscription: clean title, frother $0, no shipping line', () => {
  const facts: OrderFacts = {
    ...base,
    totalCents: 5075,
    lines: [
      {
        title: 'Electric Frother',
        quantity: 1,
        subtotalCents: 0,
        taxes: [{ title: 'IL Sales Tax', ratePercent: 10.5, amountCents: 0 }],
      },
      {
        title: '1 × The Ritual (at $50.00 / every 4 weeks)',
        quantity: 1,
        subtotalCents: 5000,
        taxes: [{ title: 'IL Sales Tax', ratePercent: 9.25, amountCents: 0 }, ...IL(75)],
      },
    ],
  };
  const b = buildOrderMoneyFields(facts, { isLive: true });
  assert.equal(b.matches, true);
  assert.equal(b.lineItems[1]?.title, 'The Ritual');
  assert.equal(b.lineItems[0]?.priceSet?.shopMoney.amount, '0.00');
  assert.equal(b.lineItems[0]?.taxLines, undefined, 'zero-amount tax entries are dropped');
  assert.equal(b.lineItems[1]?.taxLines?.length, 1);
  assert.equal(b.shippingLines, undefined);
});

check('3. Ritual Duo: quantity 2 is priced per bag, not doubled', () => {
  const facts: OrderFacts = {
    ...base,
    totalCents: 10150,
    lines: [
      {
        title: '2 × The Ritual (at $50.00 / every 8 weeks)',
        quantity: 2,
        subtotalCents: 10000,
        taxes: IL(150),
      },
    ],
  };
  const b = buildOrderMoneyFields(facts, { isLive: true });
  assert.equal(b.lineItems[0]?.priceSet?.shopMoney.amount, '50.00');
  assert.equal(b.lineItems[0]?.quantity, 2);
  assert.equal(b.lineItems[0]?.title, 'The Ritual');
  assert.equal(b.matches, true);
});

check('4. 10% code: fixed-dollar discount labelled with the code', () => {
  const facts: OrderFacts = {
    ...base,
    totalCents: 5900,
    lines: [{ title: 'The Ritual', quantity: 1, subtotalCents: 6000, taxes: [] }],
    shipping: { title: 'Standard shipping', amountCents: 500, taxes: [] },
    discount: { code: 'WELCOME10', amountCents: 600 },
  };
  const b = buildOrderMoneyFields(facts, { isLive: true });
  assert.deepEqual(b.discountCode, {
    itemFixedDiscountCode: {
      code: 'WELCOME10',
      amountSet: { shopMoney: { amount: '6.00', currencyCode: 'USD' } },
    },
  });
  assert.equal(b.matches, true);
});

check('5. free shipping is still recorded as a $0.00 line', () => {
  const facts: OrderFacts = {
    ...base,
    totalCents: 10500,
    lines: [
      { title: 'The Ritual', quantity: 1, subtotalCents: 6000, taxes: [] },
      { title: 'Protein Powder', quantity: 1, subtotalCents: 4500, taxes: [] },
    ],
    shipping: { title: 'Free shipping', amountCents: 0, taxes: [] },
  };
  const b = buildOrderMoneyFields(facts, { isLive: true });
  assert.equal(b.shippingLines?.[0]?.title, 'Free shipping');
  assert.equal(b.shippingLines?.[0]?.priceSet.shopMoney.amount, '0.00');
  assert.equal(b.matches, true);
});

check('6. parts that do not add up are flagged', () => {
  const facts: OrderFacts = {
    ...base,
    totalCents: 7000,
    lines: [{ title: 'The Ritual', quantity: 1, subtotalCents: 6000, taxes: [] }],
  };
  const b = buildOrderMoneyFields(facts, { isLive: true });
  assert.equal(b.matches, false);
  assert.equal(b.computedTotalCents, 6000);
  assert.equal(
    b.transactions?.[0]?.amountSet.shopMoney.amount,
    '70.00',
    'payment still records what Stripe charged',
  );
});

check('7. sandbox payments become Shopify test orders', () => {
  const facts: OrderFacts = {
    ...base,
    totalCents: 6000,
    paidAt: new Date('2026-10-06T10:00:00Z'),
    lines: [{ title: 'The Ritual', quantity: 1, subtotalCents: 6000, taxes: [] }],
  };
  const sandbox = buildOrderMoneyFields(facts, { isLive: false });
  assert.equal(sandbox.test, true);
  assert.equal(sandbox.transactions?.[0]?.test, true);
  assert.equal(sandbox.processedAt, '2026-10-06T10:00:00.000Z');
  const live = buildOrderMoneyFields(facts, { isLive: true });
  assert.equal('test' in live, false);
  assert.equal('test' in (live.transactions?.[0] ?? {}), false);
});

check('title clean-up leaves plain names alone', () => {
  assert.equal(cleanLineTitle('Protein Powder'), 'Protein Powder');
  assert.equal(cleanLineTitle('2 × The Ritual (at $55.25 / every 6 weeks)'), 'The Ritual');
  assert.equal(cleanLineTitle('  Organic Tee  '), 'Organic Tee');
});

check('a payment dated in the future is left for Shopify to date', () => {
  const facts: OrderFacts = {
    ...base,
    totalCents: 6000,
    paidAt: new Date(Date.now() + 86_400_000),
    lines: [{ title: 'The Ritual', quantity: 1, subtotalCents: 6000, taxes: [] }],
  };
  const b = buildOrderMoneyFields(facts, { isLive: true });
  assert.equal('processedAt' in b, false);
  assert.equal('processedAt' in (b.transactions?.[0] ?? {}), false);
});

console.log(`\n${passed} checks passed`);
