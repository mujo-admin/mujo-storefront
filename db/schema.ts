import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull().unique(),
    stripeCustomerId: text('stripe_customer_id').unique(),
    shopifyCustomerId: text('shopify_customer_id').unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('customers_email_idx').on(t.email),
    index('customers_stripe_idx').on(t.stripeCustomerId),
  ],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stripeSubscriptionId: text('stripe_subscription_id').unique().notNull(),
    customerId: uuid('customer_id')
      .references(() => customers.id)
      .notNull(),
    // active | past_due | canceled | paused | trialing | unpaid | incomplete | incomplete_expired
    status: text('status').notNull(),
    stripePriceId: text('stripe_price_id').notNull(),
    currentPeriodStart: timestamp('current_period_start').notNull(),
    currentPeriodEnd: timestamp('current_period_end').notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
    canceledAt: timestamp('canceled_at'),
    pausedAt: timestamp('paused_at'),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('subscriptions_customer_idx').on(t.customerId),
    index('subscriptions_status_idx').on(t.status),
  ],
);

export const orderMirror = pgTable(
  'order_mirror',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stripeChargeId: text('stripe_charge_id').unique().notNull(),
    stripeCheckoutSessionId: text('stripe_checkout_session_id'),
    stripeInvoiceId: text('stripe_invoice_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    shopifyOrderId: text('shopify_order_id').unique().notNull(),
    shopifyOrderName: text('shopify_order_name').notNull(),
    customerId: uuid('customer_id')
      .references(() => customers.id)
      .notNull(),
    // one_time | subscription_initial | subscription_renewal | subscription_update
    type: text('type').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('order_mirror_customer_idx').on(t.customerId),
    index('order_mirror_invoice_idx').on(t.stripeInvoiceId),
  ],
);

export const webhookEvents = pgTable('webhook_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  stripeEventId: text('stripe_event_id').unique().notNull(),
  type: text('type').notNull(),
  receivedAt: timestamp('received_at').defaultNow().notNull(),
  processedAt: timestamp('processed_at'),
  error: text('error'),
});

export const magicLinkTokens = pgTable(
  'magic_link_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('magic_link_tokens_email_idx').on(t.email),
    index('magic_link_tokens_expires_idx').on(t.expiresAt),
  ],
);

export const carts = pgTable(
  'carts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customerId: uuid('customer_id')
      .references(() => customers.id, { onDelete: 'cascade' })
      .notNull()
      .unique(),
    items: jsonb('items').$type<unknown[]>().default([]).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [index('carts_customer_id_idx').on(t.customerId)],
);
