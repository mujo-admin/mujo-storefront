// /account — customer dashboard. Server component, gates on session,
// renders <AccountChrome> + <DashboardCards>. Layout matches the canonical
// design at `context/import/New website build/mujo_account_dashboard.html`.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, gte } from "drizzle-orm";
import Stripe from "stripe";
import { customers, db, orderMirror, subscriptions } from "db";
import { stripe } from "lib/stripe";
import { getSession } from "lib/session";
import { resolvePriceId } from "lib/cart/price-id-map";
import { AccountChrome } from "components/account/account-chrome";
import {
  DashboardCards,
  type DashboardOrder,
  type DashboardSubscription,
  type DashboardSavings,
} from "components/account/dashboard-cards";

export const metadata: Metadata = {
  title: "Account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ACTIVE_SUB_STATUSES = ["active", "trialing", "past_due", "paused"] as const;

export default async function AccountPage() {
  const session = await getSession();
  if (!session) {
    redirect("/account/login");
  }

  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const [activeSubRow, recentOrders, subOrdersThisYear, allSubOrders, customerRow] =
    await Promise.all([
      db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.customerId, session.customerId),
            inArray(subscriptions.status, [...ACTIVE_SUB_STATUSES]),
          ),
        )
        .orderBy(desc(subscriptions.createdAt))
        .limit(1),
      db
        .select()
        .from(orderMirror)
        .where(eq(orderMirror.customerId, session.customerId))
        .orderBy(desc(orderMirror.createdAt))
        .limit(3),
      db
        .select()
        .from(orderMirror)
        .where(
          and(
            eq(orderMirror.customerId, session.customerId),
            inArray(orderMirror.type, [
              "subscription_initial",
              "subscription_renewal",
            ]),
            gte(orderMirror.createdAt, yearStart),
          ),
        ),
      db
        .select()
        .from(orderMirror)
        .where(
          and(
            eq(orderMirror.customerId, session.customerId),
            inArray(orderMirror.type, [
              "subscription_initial",
              "subscription_renewal",
            ]),
          ),
        )
        .orderBy(desc(orderMirror.createdAt)),
      db
        .select()
        .from(customers)
        .where(eq(customers.id, session.customerId))
        .limit(1),
    ]);

  const sub = activeSubRow[0];
  const customer = customerRow[0];

  // Pull display name from Stripe Customer (single source of truth — see plan
  // §5.4). Soft-fail if Stripe is unreachable.
  let firstName: string | null = null;
  if (customer?.stripeCustomerId) {
    try {
      const stripeCustomer = await stripe.customers.retrieve(
        customer.stripeCustomerId,
      );
      if (
        stripeCustomer &&
        !(stripeCustomer as Stripe.DeletedCustomer).deleted
      ) {
        const name = (stripeCustomer as Stripe.Customer).name;
        if (name) {
          const trimmed = name.trim();
          firstName = trimmed.length > 0 ? trimmed.split(/\s+/)[0]! : null;
        }
      }
    } catch (err) {
      console.error("[account] stripe customer retrieve failed", err);
    }
  }

  const subscription: DashboardSubscription | null = sub
    ? {
        id: sub.id,
        stripeSubscriptionId: sub.stripeSubscriptionId,
        status: sub.status,
        stripePriceId: sub.stripePriceId,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        pausedAt: sub.pausedAt,
        createdAt: sub.createdAt,
      }
    : null;

  const orders: DashboardOrder[] = recentOrders.map((o) => {
    // Resolve product label from Stripe Price ID via the existing cart helper —
    // the order's first line item Price ID isn't stored, so we use the most
    // recent active subscription's Price as a best-effort label for sub orders.
    const priceId =
      o.type.startsWith("subscription") && sub ? sub.stripePriceId : null;
    const meta = priceId
      ? resolvePriceId(priceId, { isSubscription: true })
      : null;
    const productLabel = meta
      ? `${meta.productTitle} · ${meta.variantTitle.replace(" · Subscribe & save", "").replace(" · One-time", "")}`
      : "Mujo order";
    return {
      id: o.id,
      shopifyOrderName: o.shopifyOrderName,
      type: o.type,
      amountCents: o.amountCents,
      currency: o.currency,
      createdAt: o.createdAt,
      productLabel,
    };
  });

  // Subscriber savings: sum subscription_initial + subscription_renewal
  // amountCents this calendar year, then compute the implied savings vs.
  // retail. The subscription Price is locked at 25% off retail per offer
  // spec, so saved = paid * (0.25 / 0.75).
  const paidThisYearCents = subOrdersThisYear.reduce(
    (sum, o) => sum + o.amountCents,
    0,
  );
  const savedThisYearCents = Math.round((paidThisYearCents * 0.25) / 0.75);

  const memberSinceDate = allSubOrders[allSubOrders.length - 1]?.createdAt ?? null;
  const memberSince = memberSinceDate
    ? memberSinceDate.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      })
    : null;

  const savings: DashboardSavings = {
    savedThisYearCents,
    deliveryCount: allSubOrders.length,
    memberSince,
  };

  return (
    <AccountChrome
      activeTab="overview"
      eyebrow="Account"
      title="Welcome back,"
      titleAccent={`${firstName ?? "friend"}.`}
      lede="Everything you need is here. Skip a delivery, change your details, see a past order. Two taps from anywhere."
      containerWidth="wide"
    >
      <DashboardCards
        subscription={subscription}
        recentOrders={orders}
        savings={savings}
      />
    </AccountChrome>
  );
}
