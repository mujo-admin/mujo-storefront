// Server component — the 3-card grid on /account.
//
// Card 1 — Active subscription summary (or empty state + CTA to /products/mujo-ritual)
// Card 2 — Recent 3 orders (or empty state + CTA to /shop)
// Card 3 — Profile + email-prefs status (links to /account/profile)
//
// All data passed in by the parent page; this file just renders.

import Link from "next/link";
import { resolvePriceId } from "lib/cart/price-id-map";

export type DashboardSubscription = {
  id: string;
  stripeSubscriptionId: string;
  status: string;
  stripePriceId: string;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  pausedAt: Date | null;
};

export type DashboardOrder = {
  id: string;
  shopifyOrderName: string;
  type: string;
  amountCents: number;
  currency: string;
  createdAt: Date;
};

export type DashboardProfile = {
  email: string;
  firstName: string | null;
  marketingConsent: "subscribed" | "unsubscribed" | "unknown";
};

export function DashboardCards({
  subscription,
  recentOrders,
  profile,
}: {
  subscription: DashboardSubscription | null;
  recentOrders: DashboardOrder[];
  profile: DashboardProfile;
}) {
  return (
    <div className="dash-grid">
      <SubscriptionCard subscription={subscription} />
      <OrdersCard orders={recentOrders} />
      <ProfileCard profile={profile} />

      <style>{`
        .dash-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 18px;
        }
        .dash-card {
          background: var(--cream);
          border-radius: 14px;
          padding: 24px 22px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .dash-eyebrow {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.12em;
          color: var(--mute);
          text-transform: uppercase;
        }
        .dash-card-title {
          font-family: var(--f-display);
          font-size: 19px;
          font-weight: 500;
          color: var(--ink);
          margin: 0;
          line-height: 1.25;
        }
        .dash-card-meta {
          font-size: 13px;
          color: var(--ink-soft);
          line-height: 1.5;
          margin: 0;
        }
        .dash-card-empty {
          font-size: 14px;
          color: var(--ink-soft);
          line-height: 1.5;
          margin: 0 0 4px;
        }
        .dash-pill {
          display: inline-block;
          font-family: var(--f-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          padding: 3px 9px;
          border-radius: 999px;
          text-transform: uppercase;
        }
        .dash-pill.active { background: rgba(124, 167, 124, 0.18); color: var(--sage-deep, #4d6f4d); }
        .dash-pill.paused { background: rgba(242, 169, 47, 0.16); color: #8b5a07; }
        .dash-pill.canceling { background: rgba(220, 90, 70, 0.14); color: #9b3d2c; }
        .dash-pill.past_due { background: rgba(220, 90, 70, 0.18); color: #9b3d2c; }
        .dash-pill.onetime { background: rgba(0,0,0,0.06); color: var(--ink-soft); }
        .dash-pill.subscription { background: rgba(242, 104, 47, 0.12); color: var(--orange-deep); }
        .dash-cta {
          font-family: var(--f-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
          color: var(--orange-deep);
          text-decoration: none;
          margin-top: auto;
        }
        .dash-cta:hover { color: var(--orange); }
        .dash-orders-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .dash-order-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          color: var(--ink);
        }
        .dash-order-date {
          font-family: var(--f-mono);
          font-size: 11px;
          color: var(--mute);
          letter-spacing: 0.04em;
        }
        .dash-order-name { color: var(--ink); }
        .dash-order-amount {
          font-variant-numeric: tabular-nums;
          font-weight: 500;
        }
        .dash-profile-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .dash-profile-label {
          font-family: var(--f-mono);
          font-size: 10px;
          letter-spacing: 0.06em;
          color: var(--mute);
          text-transform: uppercase;
        }
        .dash-profile-value {
          font-size: 14px;
          color: var(--ink);
          word-break: break-all;
        }
      `}</style>
    </div>
  );
}

function SubscriptionCard({
  subscription,
}: {
  subscription: DashboardSubscription | null;
}) {
  if (!subscription) {
    return (
      <div className="dash-card">
        <div className="dash-eyebrow">Subscription</div>
        <h2 className="dash-card-title">No active subscription</h2>
        <p className="dash-card-empty">
          Subscribe & save 15% on every Ritual delivery. Pause or cancel
          anytime.
        </p>
        <Link href="/products/mujo-ritual" className="dash-cta">
          Start a subscription →
        </Link>
      </div>
    );
  }

  const meta = resolvePriceId(subscription.stripePriceId, { isSubscription: true });
  const productLabel = meta
    ? `${meta.productTitle} — ${meta.variantTitle}`
    : "Mujo subscription";

  const pillClass = pillForSubscription(subscription);
  const pillText = labelForSubscription(subscription);

  return (
    <div className="dash-card">
      <div className="dash-eyebrow">Subscription</div>
      <h2 className="dash-card-title">{productLabel}</h2>
      <p className="dash-card-meta">
        <span className={`dash-pill ${pillClass}`}>{pillText}</span>
      </p>
      <p className="dash-card-meta">
        {subscription.cancelAtPeriodEnd
          ? `Ends ${formatDate(subscription.currentPeriodEnd)}`
          : `Next delivery ${formatDate(subscription.currentPeriodEnd)}`}
      </p>
      <Link href="/account/subscription" className="dash-cta">
        Manage subscription →
      </Link>
    </div>
  );
}

function OrdersCard({ orders }: { orders: DashboardOrder[] }) {
  if (orders.length === 0) {
    return (
      <div className="dash-card">
        <div className="dash-eyebrow">Orders</div>
        <h2 className="dash-card-title">No orders yet</h2>
        <p className="dash-card-empty">
          Once you place your first order, you&rsquo;ll see it here.
        </p>
        <Link href="/shop" className="dash-cta">
          Browse the shop →
        </Link>
      </div>
    );
  }

  return (
    <div className="dash-card">
      <div className="dash-eyebrow">Recent orders</div>
      <h2 className="dash-card-title">
        {orders.length === 1 ? "Latest order" : `Last ${orders.length} orders`}
      </h2>
      <ul className="dash-orders-list">
        {orders.map((o) => (
          <li key={o.id} className="dash-order-row">
            <span className="dash-order-date">{formatShortDate(o.createdAt)}</span>
            <span className="dash-order-name">{o.shopifyOrderName}</span>
            <span className="dash-order-amount">
              {formatCents(o.amountCents, o.currency)}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/account/orders" className="dash-cta">
        View all orders →
      </Link>
    </div>
  );
}

function ProfileCard({ profile }: { profile: DashboardProfile }) {
  return (
    <div className="dash-card">
      <div className="dash-eyebrow">Profile</div>
      <h2 className="dash-card-title">
        {profile.firstName ? `Hi, ${profile.firstName}` : "Your details"}
      </h2>
      <div className="dash-profile-row">
        <span className="dash-profile-label">Email</span>
        <span className="dash-profile-value">{profile.email}</span>
      </div>
      <div className="dash-profile-row">
        <span className="dash-profile-label">Marketing emails</span>
        <span className="dash-profile-value">
          {profile.marketingConsent === "subscribed"
            ? "Subscribed"
            : profile.marketingConsent === "unsubscribed"
              ? "Unsubscribed"
              : "—"}
        </span>
      </div>
      <Link href="/account/profile" className="dash-cta">
        Edit profile →
      </Link>
    </div>
  );
}

function pillForSubscription(s: DashboardSubscription): string {
  if (s.status === "paused" || s.pausedAt) return "paused";
  if (s.cancelAtPeriodEnd) return "canceling";
  if (s.status === "past_due" || s.status === "unpaid") return "past_due";
  return "active";
}

function labelForSubscription(s: DashboardSubscription): string {
  if (s.status === "paused" || s.pausedAt) return "Paused";
  if (s.cancelAtPeriodEnd) return "Cancels at period end";
  if (s.status === "past_due") return "Payment overdue";
  if (s.status === "trialing") return "Trial";
  return "Active";
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatCents(cents: number, currency: string): string {
  const amount = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(amount);
}
