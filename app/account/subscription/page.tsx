// /account/subscription — subscription management.
//
// Server component: gates on session, fetches active subscription, hands
// state to the client <SubscriptionControls /> component which owns the
// modals + POSTs to /api/account/subscription/[action].
//
// Customer Portal pause + sub-update are deprecated (per memory
// project_stripe_tax_and_portal.md); the underlying Stripe API still works
// server-side, so all 4 actions go through our own routes.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import Stripe from "stripe";
import { db, subscriptions } from "db";
import { stripe } from "lib/stripe";
import { getSession } from "lib/session";
import { resolvePriceId } from "lib/cart/price-id-map";
import {
  SubscriptionControls,
  type SubscriptionDetail,
} from "components/account/subscription-controls";

export const metadata: Metadata = {
  title: "Subscription",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ACTIVE_SUB_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "paused",
] as const;

export default async function SubscriptionPage() {
  const session = await getSession();
  if (!session) {
    redirect("/account/login");
  }

  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.customerId, session.customerId),
        inArray(subscriptions.status, [...ACTIVE_SUB_STATUSES]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  const sub = rows[0];

  if (!sub) {
    return (
      <div className="sub-shell">
        <div className="sub-shell-inner">
          <Link href="/account" className="sub-back">
            ← Back to account
          </Link>
          <h1 className="sub-title">
            No active <em>subscription</em>
          </h1>
          <p className="sub-empty">
            Subscribe & save 15% on every Ritual delivery. Pause or cancel
            anytime &mdash; no commitment, no cancellation fees.
          </p>
          <Link href="/products/mujo-ritual" className="sub-cta">
            Start a subscription →
          </Link>
        </div>
        <SubStyle />
      </div>
    );
  }

  // Pull the live Stripe Subscription so the price + amount we render reflect
  // current state (the DB mirror only stores Price ID + period end). Soft-fail
  // back to the DB row if Stripe is unreachable — page still renders, just
  // without the unit_amount detail.
  let unitAmountCents: number | null = null;
  let currency = "usd";
  try {
    const stripeSub = (await stripe.subscriptions.retrieve(
      sub.stripeSubscriptionId,
      { expand: ["items.data.price"] },
    )) as Stripe.Subscription;
    const price = stripeSub.items.data[0]?.price;
    if (price) {
      unitAmountCents = price.unit_amount ?? null;
      currency = price.currency ?? "usd";
    }
  } catch (err) {
    console.error("[subscription] stripe retrieve failed", err);
  }

  const meta = resolvePriceId(sub.stripePriceId, { isSubscription: true });
  const productLabel = meta
    ? `${meta.productTitle} — ${meta.variantTitle}`
    : "Mujo subscription";

  const detail: SubscriptionDetail = {
    stripeSubscriptionId: sub.stripeSubscriptionId,
    productLabel,
    status: sub.status,
    currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    pausedAt: sub.pausedAt?.toISOString() ?? null,
    unitAmountCents,
    currency,
    createdAt: sub.createdAt.toISOString(),
  };

  return (
    <div className="sub-shell">
      <div className="sub-shell-inner">
        <Link href="/account" className="sub-back">
          ← Back to account
        </Link>
        <h1 className="sub-title">
          Manage <em>subscription</em>
        </h1>
        <SubscriptionControls detail={detail} />
      </div>
      <SubStyle />
    </div>
  );
}

function SubStyle() {
  return (
    <style>{`
      .sub-shell {
        background: var(--cream);
        min-height: calc(100vh - 100px);
        font-family: var(--f-body);
        color: var(--ink);
      }
      .sub-shell-inner {
        max-width: 720px;
        margin: 0 auto;
        padding: 40px 20px 80px;
      }
      .sub-back {
        display: inline-block;
        font-family: var(--f-mono);
        font-size: 11px;
        letter-spacing: 0.06em;
        color: var(--ink-soft);
        text-decoration: none;
        margin-bottom: 24px;
      }
      .sub-back:hover { color: var(--orange-deep); }
      .sub-title {
        font-family: var(--f-display);
        font-size: 30px;
        font-weight: 500;
        letter-spacing: -0.01em;
        margin: 0 0 24px;
        line-height: 1.15;
      }
      .sub-title em {
        font-family: 'Instrument Serif', Georgia, serif;
        font-style: italic;
        color: var(--orange-deep);
        font-weight: 400;
      }
      .sub-empty {
        font-size: 15px;
        color: var(--ink-soft);
        line-height: 1.55;
        margin: 0 0 22px;
        max-width: 540px;
      }
      .sub-cta {
        display: inline-block;
        background: var(--orange);
        color: #fff;
        text-decoration: none;
        padding: 12px 22px;
        border-radius: 100px;
        font-size: 14px;
        font-weight: 500;
        font-family: var(--f-body);
      }
      .sub-cta:hover { background: var(--orange-deep); }
      @media (max-width: 600px) {
        .sub-shell-inner { padding: 28px 14px 60px; }
        .sub-title { font-size: 24px; }
      }
    `}</style>
  );
}
