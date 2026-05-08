// Shared helpers for Stripe webhook handlers — customer upserts, Shopify
// linking, period extraction (dahlia API change: period is now per-item).

import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';
import { customers, db, subscriptions } from 'db';
import { findOrCreateCustomer } from 'lib/shopify-admin';
import {
  setStripeCustomerIdOnCustomer,
  setSubscriptionStatusOnCustomer,
  setCurrentPeriodEndOnCustomer,
  type SubscriptionStatus,
} from 'lib/metafields';

/**
 * Find an existing app-DB customer row by Stripe customer ID, or by email if
 * we don't yet have the Stripe link. Creates the row if neither exists. Also
 * ensures the matching Shopify customer exists and the cross-link metafield
 * is written. Returns the app-DB row plus the Shopify GID.
 */
export async function upsertCustomerForStripe(args: {
  email: string;
  stripeCustomerId: string;
  firstName?: string;
  lastName?: string;
}): Promise<{
  customerId: string;
  shopifyCustomerGid: string;
}> {
  const { email, stripeCustomerId, firstName, lastName } = args;

  let row = (
    await db
      .select()
      .from(customers)
      .where(eq(customers.stripeCustomerId, stripeCustomerId))
      .limit(1)
  )[0];

  if (!row) {
    row = (
      await db.select().from(customers).where(eq(customers.email, email)).limit(1)
    )[0];
  }

  const shopifyCustomer = await findOrCreateCustomer({ email, firstName, lastName });

  if (!row) {
    const inserted = await db
      .insert(customers)
      .values({
        email,
        stripeCustomerId,
        shopifyCustomerId: shopifyCustomer.id,
      })
      .returning();
    const newRow = inserted[0];
    if (!newRow) throw new Error('Customer insert returned no row');
    row = newRow;
  } else if (
    row.stripeCustomerId !== stripeCustomerId ||
    row.shopifyCustomerId !== shopifyCustomer.id
  ) {
    await db
      .update(customers)
      .set({
        stripeCustomerId,
        shopifyCustomerId: shopifyCustomer.id,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, row.id));
  }

  try {
    await setStripeCustomerIdOnCustomer(shopifyCustomer.id, stripeCustomerId);
  } catch (err) {
    console.error('[upsertCustomer] failed to write stripe_customer_id metafield', err);
  }

  return { customerId: row.id, shopifyCustomerGid: shopifyCustomer.id };
}

export async function echoSubscriptionStatusToShopify(
  shopifyCustomerGid: string,
  status: SubscriptionStatus,
  currentPeriodEnd?: Date,
) {
  try {
    await setSubscriptionStatusOnCustomer(shopifyCustomerGid, status);
    if (currentPeriodEnd) {
      await setCurrentPeriodEndOnCustomer(shopifyCustomerGid, currentPeriodEnd.toISOString());
    }
  } catch (err) {
    console.error('[echoSubscriptionStatus] metafield write failed', { status, err });
  }
}

/** Map Stripe subscription status to our internal SubscriptionStatus union. */
export function normalizeSubscriptionStatus(
  s: Stripe.Subscription.Status,
): SubscriptionStatus {
  return s;
}

/**
 * Mirror a Stripe Subscription object into our `subscriptions` table. Idempotent —
 * always writes the current Stripe state to whatever row already exists for
 * this stripe_subscription_id.
 *
 * Used by:
 *   - `customer.subscription.updated` webhook handler (for async events)
 *   - `/api/account/subscription/[action]` server route (for inline post-Stripe
 *     write so the next page render doesn't see stale DB state before the
 *     webhook lands)
 */
export async function syncSubscriptionToDb(sub: Stripe.Subscription) {
  const period = extractSubscriptionPeriod(sub);
  const stripePriceId = sub.items.data[0]?.price.id ?? '';
  const status = normalizeSubscriptionStatus(sub.status);

  const existing = (
    await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, sub.id))
      .limit(1)
  )[0];

  if (!existing) return; // Insert is left to the webhook path; action routes
                         // only mutate existing rows.

  await db
    .update(subscriptions)
    .set({
      status,
      stripePriceId,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      pausedAt: sub.pause_collection ? new Date() : null,
      metadata: sub.metadata ?? {},
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, existing.id));
}

/**
 * Read the canonical billing cycle length (in seconds) from a Stripe
 * Subscription's first item's price.recurring. Used by pause/skip math
 * so the cycle stays anchored to the price's true interval rather than
 * compounding off whatever `current_period_end - current_period_start`
 * happens to be after prior pauses or skips.
 */
export function getSubscriptionCycleSeconds(sub: Stripe.Subscription): number {
  const recurring = sub.items.data[0]?.price.recurring;
  if (!recurring) return 30 * 24 * 60 * 60; // 30-day fallback

  const { interval, interval_count } = recurring;
  const count = interval_count ?? 1;
  const intervalSeconds: Record<string, number> = {
    day: 86400,
    week: 7 * 86400,
    month: 28 * 86400, // 28 days = treat a "month" as 4 weeks for cleaner cycles
    year: 365 * 86400,
  };
  return (intervalSeconds[interval] ?? 30 * 86400) * count;
}

/**
 * Dahlia API change: `current_period_start` / `current_period_end` moved off the
 * Subscription onto each SubscriptionItem. For our single-item subscriptions,
 * read the first item; if missing, fall back to `billing_cycle_anchor`.
 */
export function extractSubscriptionPeriod(sub: Stripe.Subscription): {
  start: Date;
  end: Date;
} {
  const item = sub.items.data[0];
  if (item && item.current_period_start && item.current_period_end) {
    return {
      start: new Date(item.current_period_start * 1000),
      end: new Date(item.current_period_end * 1000),
    };
  }
  // Fallback: use billing_cycle_anchor as start, and a 30-day window end
  const anchor = new Date(sub.billing_cycle_anchor * 1000);
  return { start: anchor, end: new Date(anchor.getTime() + 30 * 24 * 60 * 60 * 1000) };
}

/**
 * Dahlia: Invoice → Subscription is now `invoice.parent.subscription_details.subscription`.
 * Returns the subscription ID string or null if the invoice isn't tied to one.
 */
export function extractInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parent = invoice.parent;
  if (!parent || parent.type !== 'subscription_details') return null;
  const sub = parent.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
}

/**
 * Dahlia: Invoice payments live under `invoice.payments` (ApiList). Each entry
 * may carry a payment_intent. Returns the first paid payment_intent ID.
 */
export async function extractInvoicePaymentIntentId(
  invoice: Stripe.Invoice,
  stripe: Stripe,
): Promise<string | null> {
  // The webhook payload may not include payments; list explicitly if absent.
  let payments = invoice.payments;
  if (!payments) {
    if (!invoice.id) return null;
    const refreshed = await stripe.invoices.retrieve(invoice.id, {
      expand: ['payments'],
    });
    payments = refreshed.payments;
  }
  if (!payments) return null;
  for (const p of payments.data) {
    const pi = p.payment?.payment_intent;
    if (!pi) continue;
    return typeof pi === 'string' ? pi : pi.id;
  }
  return null;
}
