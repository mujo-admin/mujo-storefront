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

  // Read live Stripe state for the active sub — derives the canonical
  // interval label (from price.recurring) and the actual coupon percent
  // (from discounts.source.coupon). DB mirror is fine for status/period
  // but compounds across pauses; live read is authoritative.
  let stripeSub: Stripe.Subscription | null = null;
  let livePeriodEnd: Date | null = null;
  let liveCancelAtPeriodEnd = false;
  let liveIsPaused = false;
  let intervalLabel = "Every 4 weeks"; // safe fallback
  let discountPercent = 0;

  if (sub) {
    try {
      stripeSub = (await stripe.subscriptions.retrieve(
        sub.stripeSubscriptionId,
        {
          expand: ["items.data.price", "discounts.source.coupon"],
        },
      )) as Stripe.Subscription;

      const item = stripeSub.items.data[0];
      const recurring = item?.price.recurring;
      if (recurring) {
        const count = recurring.interval_count ?? 1;
        if (recurring.interval === "month" && count === 1)
          intervalLabel = "Every 4 weeks";
        else if (recurring.interval === "month" && count === 3)
          intervalLabel = "Every 3 months";
        else if (recurring.interval === "month")
          intervalLabel = `Every ${count} months`;
        else if (recurring.interval === "week" && count === 1)
          intervalLabel = "Weekly";
        else if (recurring.interval === "week" && count === 2)
          intervalLabel = "Every 2 weeks";
        else if (recurring.interval === "week")
          intervalLabel = `Every ${count} weeks`;
        else if (recurring.interval === "year")
          intervalLabel = count === 1 ? "Yearly" : `Every ${count} years`;
      }

      // Live period end (canonical — DB mirror compounds across pauses).
      const periodEndUnix =
        item?.current_period_end ??
        stripeSub.billing_cycle_anchor + 30 * 86400;
      livePeriodEnd = new Date(periodEndUnix * 1000);
      liveCancelAtPeriodEnd = stripeSub.cancel_at_period_end;
      liveIsPaused = Boolean(stripeSub.pause_collection);

      // Pull coupon percent_off from the first active discount.
      const firstDiscount = stripeSub.discounts?.[0];
      const discount =
        firstDiscount && typeof firstDiscount === "object"
          ? (firstDiscount as Stripe.Discount)
          : null;
      const couponRef = discount?.source?.coupon;
      const coupon =
        couponRef && typeof couponRef === "object"
          ? (couponRef as Stripe.Coupon)
          : null;
      if (coupon && coupon.percent_off) {
        discountPercent = coupon.percent_off;
      }
    } catch (err) {
      console.error("[account] stripe sub retrieve failed", err);
    }
  }

  const subscription: DashboardSubscription | null = sub
    ? {
        id: sub.id,
        stripeSubscriptionId: sub.stripeSubscriptionId,
        status: stripeSub?.status ?? sub.status,
        stripePriceId: stripeSub?.items.data[0]?.price.id ?? sub.stripePriceId,
        currentPeriodEnd: livePeriodEnd ?? sub.currentPeriodEnd,
        cancelAtPeriodEnd: liveCancelAtPeriodEnd || sub.cancelAtPeriodEnd,
        isPaused: liveIsPaused || Boolean(sub.pausedAt),
        intervalLabel,
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
  // amountCents this calendar year, then compute implied retail savings.
  // Math: if paid = retail × (1 - p), then saved = retail × p = paid × p / (1 - p).
  // Discount percent comes live from the active sub's coupon — eliminates
  // the previous 0.25/0.75 hardcode that didn't match Mujo's actual 15%.
  const paidThisYearCents = subOrdersThisYear.reduce(
    (sum, o) => sum + o.amountCents,
    0,
  );
  const p = discountPercent / 100;
  const savedThisYearCents =
    p > 0 && p < 1 ? Math.round((paidThisYearCents * p) / (1 - p)) : 0;

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
    discountPercent,
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
