// Read-back: what's in webhook_events + customers + subscriptions + order_mirror.
// Useful after firing test events to see what landed.

import postgres from 'postgres';

const url = process.env.POSTGRES_URL_NON_POOLING;
if (!url) {
  console.error('POSTGRES_URL_NON_POOLING not set');
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });

try {
  console.log('=== webhook_events (most recent 10) ===');
  const events = await sql`
    SELECT stripe_event_id, type, received_at, processed_at, error
    FROM webhook_events
    ORDER BY received_at DESC
    LIMIT 10
  `;
  if (events.length === 0) {
    console.log('  (no events received yet)');
  } else {
    for (const e of events) {
      const status = e.error ? `✗ ERROR: ${e.error}` : e.processed_at ? '✓ processed' : '⏳ in-flight';
      console.log(
        `  ${e.received_at.toISOString()} | ${e.type.padEnd(40)} | ${e.stripe_event_id} | ${status}`,
      );
    }
  }

  console.log('\n=== customers (most recent 5) ===');
  const customers = await sql`
    SELECT email, stripe_customer_id, shopify_customer_id, created_at
    FROM customers
    ORDER BY created_at DESC
    LIMIT 5
  `;
  if (customers.length === 0) {
    console.log('  (no customers yet)');
  } else {
    for (const c of customers) {
      console.log(`  ${c.email} | stripe: ${c.stripe_customer_id ?? '—'} | shopify: ${c.shopify_customer_id ?? '—'}`);
    }
  }

  console.log('\n=== subscriptions (most recent 5) ===');
  const subs = await sql`
    SELECT stripe_subscription_id, status, current_period_end, cancel_at_period_end
    FROM subscriptions
    ORDER BY created_at DESC
    LIMIT 5
  `;
  if (subs.length === 0) {
    console.log('  (no subscriptions yet)');
  } else {
    for (const s of subs) {
      console.log(`  ${s.stripe_subscription_id} | ${s.status} | end: ${s.current_period_end.toISOString()} | cancel_at_period_end: ${s.cancel_at_period_end}`);
    }
  }

  console.log('\n=== order_mirror (most recent 5) ===');
  const orders = await sql`
    SELECT shopify_order_name, type, amount_cents, currency, stripe_charge_id
    FROM order_mirror
    ORDER BY created_at DESC
    LIMIT 5
  `;
  if (orders.length === 0) {
    console.log('  (no orders mirrored yet)');
  } else {
    for (const o of orders) {
      console.log(`  ${o.shopify_order_name} | ${o.type} | ${o.amount_cents}¢ ${o.currency} | charge: ${o.stripe_charge_id}`);
    }
  }
} finally {
  await sql.end();
}
