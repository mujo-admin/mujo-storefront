// /account — the customer dashboard. Server component, gates on session,
// fetches active subscription + recent orders + Klaviyo consent state, then
// renders the 3-card grid via <DashboardCards />.
//
// Stripe Customer.name is the source of truth for firstName/lastName per
// plan §Design Decisions item 5.4 — no schema churn for name fields.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import Stripe from "stripe";
import { customers, db, orderMirror, subscriptions } from "db";
import { stripe } from "lib/stripe";
import { getSession } from "lib/session";
import { getEmailMarketingConsent } from "lib/klaviyo";
import { LogoutButton } from "./logout-button";
import {
  DashboardCards,
  type DashboardOrder,
  type DashboardSubscription,
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

  const [activeSubRow, recentOrders, customerRow] = await Promise.all([
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
      .from(customers)
      .where(eq(customers.id, session.customerId))
      .limit(1),
  ]);

  const sub = activeSubRow[0];
  const customer = customerRow[0];

  // Pull display name from Stripe Customer (single source of truth — see plan
  // §5.4). Soft-fail if the call errors (Stripe is the chokepoint we don't
  // want bricking the dashboard).
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

  // Klaviyo consent — runs in parallel-with-Stripe in real deployment but
  // sequenced here for readability. Soft-fails to "unknown" inside the helper.
  const marketingConsent = await getEmailMarketingConsent(session.email);

  const subscription: DashboardSubscription | null = sub
    ? {
        id: sub.id,
        stripeSubscriptionId: sub.stripeSubscriptionId,
        status: sub.status,
        stripePriceId: sub.stripePriceId,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        pausedAt: sub.pausedAt,
      }
    : null;

  const orders: DashboardOrder[] = recentOrders.map((o) => ({
    id: o.id,
    shopifyOrderName: o.shopifyOrderName,
    type: o.type,
    amountCents: o.amountCents,
    currency: o.currency,
    createdAt: o.createdAt,
  }));

  return (
    <div className="account-shell">
      <header className="account-header">
        <div>
          <div className="account-eyebrow">Signed in</div>
          <h1 className="account-title">
            Welcome <em>{firstName ? "back, " + firstName : "back"}</em>
          </h1>
          <p className="account-lede">
            Manage your subscription, orders, profile, and payment method.
          </p>
        </div>
        <LogoutButton />
      </header>

      <DashboardCards
        subscription={subscription}
        recentOrders={orders}
        profile={{
          email: session.email,
          firstName,
          marketingConsent,
        }}
      />

      <style>{`
        .account-shell {
          max-width: 980px;
          margin: 0 auto;
          padding: 56px 20px 80px;
          font-family: var(--f-body);
          color: var(--ink);
        }
        .account-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 32px;
          flex-wrap: wrap;
        }
        .account-eyebrow {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.12em;
          color: var(--mute);
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .account-title {
          font-family: var(--f-display);
          font-size: 32px;
          font-weight: 500;
          letter-spacing: -0.01em;
          margin: 0 0 8px;
          line-height: 1.15;
        }
        .account-title em {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
          color: var(--orange-deep);
          font-weight: 400;
        }
        .account-lede {
          font-size: 15px;
          color: var(--ink-soft);
          line-height: 1.55;
          margin: 0;
          max-width: 540px;
        }
        @media (max-width: 600px) {
          .account-shell { padding: 36px 14px 60px; }
          .account-title { font-size: 26px; }
          .account-header { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}
