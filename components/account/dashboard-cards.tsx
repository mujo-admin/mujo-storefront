// Dashboard 2-col grid — matches the canonical design at
// `context/import/New website build/mujo_account_dashboard.html`.
//
// Server component. Left col (1.4fr): Active subscription card + Recent
// orders card. Right col (1fr): Subscriber savings (sage gradient) +
// Quick actions card.

import Link from "next/link";
import { resolvePriceId } from "lib/cart/price-id-map";

export type DashboardSubscription = {
  id: string;
  stripeSubscriptionId: string;
  status: string;
  stripePriceId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  pausedAt: Date | null;
  createdAt: Date;
};

export type DashboardOrder = {
  id: string;
  shopifyOrderName: string;
  type: string;
  amountCents: number;
  currency: string;
  createdAt: Date;
  /** Optional: looked-up product label for the line. */
  productLabel?: string;
};

export type DashboardSavings = {
  /** Total saved this calendar year (cents). */
  savedThisYearCents: number;
  /** Number of completed subscription deliveries. */
  deliveryCount: number;
  /** Member-since label (e.g. "Feb 2026"). */
  memberSince: string | null;
};

export function DashboardCards({
  subscription,
  recentOrders,
  savings,
}: {
  subscription: DashboardSubscription | null;
  recentOrders: DashboardOrder[];
  savings: DashboardSavings;
}) {
  return (
    <div className="dash-grid">
      {/* Left column */}
      <div className="dash-col">
        <ActiveSubscriptionCard subscription={subscription} />
        <RecentOrdersCard orders={recentOrders} />
      </div>

      {/* Right column */}
      <div className="dash-col">
        <SubscriberSavingsCard savings={savings} hasSub={Boolean(subscription)} />
        <QuickActionsCard hasSub={Boolean(subscription)} />
      </div>

      <style>{`
        .dash-grid {
          display: grid;
          gap: 24px;
          grid-template-columns: 1fr;
          padding-bottom: 80px;
        }
        @media (min-width: 768px) {
          .dash-grid { grid-template-columns: 1fr 1fr; gap: 28px; }
        }
        @media (min-width: 1024px) {
          .dash-grid { grid-template-columns: 1.4fr 1fr; gap: 32px; }
        }
        .dash-col {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .dash-card {
          background: #fff;
          border: 1px solid rgba(26, 26, 26, 0.06);
          border-radius: 14px;
          padding: 24px;
        }
        @media (min-width: 768px) {
          .dash-card { padding: 28px; }
        }
        .dash-card-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
        }
        .dash-eyebrow {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--orange-deep);
          font-weight: 500;
        }
        .dash-card-head a {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--orange-deep);
          text-decoration: none;
          transition: color 0.2s;
        }
        .dash-card-head a:hover { color: var(--orange); }

        /* Active subscription card */
        .sub-summary {
          display: grid;
          grid-template-columns: 64px 1fr auto;
          gap: 16px;
          align-items: center;
        }
        .sub-summary-img {
          width: 64px;
          height: 64px;
          background: var(--sand);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          flex-shrink: 0;
        }
        .sub-summary-info { min-width: 0; }
        .sub-summary-name {
          font-family: var(--f-display);
          font-size: 15px;
          font-weight: 500;
          color: var(--ink);
          margin: 0 0 4px;
          line-height: 1.3;
        }
        .sub-summary-meta {
          font-size: 13px;
          color: var(--ink-soft);
          margin: 0 0 4px;
        }
        .sub-summary-next {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.1em;
          color: var(--orange-deep);
          text-transform: uppercase;
          font-weight: 500;
        }
        .sub-summary-link {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink);
          text-decoration: none;
          padding: 8px 14px;
          border: 1px solid rgba(26, 26, 26, 0.09);
          border-radius: 100px;
          transition: all 0.2s;
          flex-shrink: 0;
          font-weight: 500;
        }
        .sub-summary-link:hover {
          border-color: var(--ink);
          background: var(--ink);
          color: #fff;
        }
        .sub-empty {
          font-size: 14px;
          color: var(--ink-soft);
          line-height: 1.55;
          margin: 0 0 14px;
        }
        .sub-cta {
          display: inline-block;
          background: var(--orange);
          color: #fff;
          text-decoration: none;
          padding: 10px 22px;
          border-radius: 100px;
          font-size: 14px;
          font-weight: 500;
        }
        .sub-cta:hover { background: var(--orange-deep); }

        /* Recent orders rows */
        .order-row {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 12px;
          padding: 14px 0;
          border-top: 1px solid rgba(26, 26, 26, 0.06);
          align-items: center;
        }
        .order-row:first-of-type { border-top: none; padding-top: 0; }
        .order-num {
          font-family: var(--f-mono);
          font-size: 12px;
          letter-spacing: 0.06em;
          color: var(--mute);
          margin-bottom: 4px;
        }
        .order-info {
          font-size: 14px;
          font-weight: 500;
          line-height: 1.3;
          color: var(--ink);
        }
        .order-date {
          font-family: var(--f-mono);
          font-size: 12px;
          color: var(--ink-soft);
          margin-top: 4px;
          letter-spacing: 0.04em;
        }
        .order-amount {
          font-family: var(--f-mono);
          font-size: 13px;
          font-weight: 500;
          color: var(--ink);
          font-variant-numeric: tabular-nums;
        }
        .orders-empty {
          font-size: 14px;
          color: var(--ink-soft);
          line-height: 1.55;
          margin: 0 0 14px;
        }
        .orders-cta {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--orange-deep);
          text-decoration: none;
        }
        .orders-cta:hover { color: var(--orange); }

        /* Subscriber savings — sage gradient card */
        .dash-savings {
          background: linear-gradient(135deg, var(--sage) 0%, var(--sage-mid) 100%);
          color: #fff;
          border-radius: 14px;
          padding: 24px;
        }
        @media (min-width: 768px) {
          .dash-savings { padding: 28px; }
        }
        .dash-savings-eyebrow {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--orange);
          font-weight: 500;
          display: inline-block;
          margin-bottom: 12px;
        }
        .dash-savings h3 {
          color: #fff;
          font-family: var(--f-display);
          font-size: 24px;
          font-weight: 500;
          margin: 0 0 8px;
          letter-spacing: -0.02em;
          line-height: 1.15;
        }
        .dash-savings h3 em {
          font-family: var(--f-serif);
          font-style: italic;
          color: var(--orange);
          font-weight: 400;
        }
        .dash-savings p {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.65);
          line-height: 1.55;
          margin: 0 0 16px;
        }
        .dash-savings-stat {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.55);
          text-transform: uppercase;
          padding-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
        }
        .dash-savings-stat strong { color: var(--orange); font-weight: 500; }

        /* Quick actions */
        .quick-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .qa-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          background: var(--cream);
          border: 1px solid transparent;
          border-radius: 10px;
          text-decoration: none;
          color: var(--ink);
          transition: all 0.2s;
        }
        .qa-link:hover {
          border-color: var(--orange);
          background: #fff;
        }
        .qa-link-icon {
          width: 36px;
          height: 36px;
          background: #fff;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: var(--orange-deep);
        }
        .qa-link-icon svg { width: 18px; height: 18px; }
        .qa-link-text {
          flex: 1;
          min-width: 0;
        }
        .qa-link-text strong {
          display: block;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.3;
          margin-bottom: 2px;
          color: var(--ink);
        }
        .qa-link-text span {
          font-size: 12px;
          color: var(--ink-soft);
        }
        .qa-link-arrow svg { width: 16px; height: 16px; opacity: 0.4; }
      `}</style>
    </div>
  );
}

function ActiveSubscriptionCard({
  subscription,
}: {
  subscription: DashboardSubscription | null;
}) {
  if (!subscription) {
    return (
      <div className="dash-card">
        <div className="dash-card-head">
          <span className="dash-eyebrow">Active subscription</span>
        </div>
        <p className="sub-empty">
          No active subscription. Subscribe & save 25% on every Ritual delivery
          — pause or cancel anytime.
        </p>
        <Link href="/products/mujo-ritual" className="sub-cta">
          Start a subscription
        </Link>
      </div>
    );
  }

  const meta = resolvePriceId(subscription.stripePriceId, { isSubscription: true });
  const productLabel = meta
    ? `${meta.productTitle} · ${meta.variantTitle.replace(" · Subscribe & save", "")}`
    : "Mujo subscription";

  const intervalLabel = formatIntervalLabel(
    subscription.currentPeriodStart,
    subscription.currentPeriodEnd,
  );

  const isPaused = subscription.status === "paused" || subscription.pausedAt !== null;
  const nextLine = subscription.cancelAtPeriodEnd
    ? `Ends · ${formatShortDate(subscription.currentPeriodEnd)}`
    : isPaused
      ? "Paused · resume anytime"
      : `Next delivery · ${formatShortDate(subscription.currentPeriodEnd)}`;

  return (
    <div className="dash-card">
      <div className="dash-card-head">
        <span className="dash-eyebrow">Active subscription</span>
        <Link href="/account/subscription">Manage →</Link>
      </div>
      <div className="sub-summary">
        <div className="sub-summary-img">🍵</div>
        <div className="sub-summary-info">
          <h3 className="sub-summary-name">{productLabel}</h3>
          <p className="sub-summary-meta">{intervalLabel} · 25% off retail</p>
          <span className="sub-summary-next">{nextLine}</span>
        </div>
        <Link href="/account/subscription" className="sub-summary-link">
          Skip / swap
        </Link>
      </div>
    </div>
  );
}

function RecentOrdersCard({ orders }: { orders: DashboardOrder[] }) {
  if (orders.length === 0) {
    return (
      <div className="dash-card">
        <div className="dash-card-head">
          <span className="dash-eyebrow">Recent orders</span>
        </div>
        <p className="orders-empty">
          No orders yet. Once you place your first one, you&rsquo;ll see it here.
        </p>
        <Link href="/shop" className="orders-cta">
          Browse the shop →
        </Link>
      </div>
    );
  }

  return (
    <div className="dash-card">
      <div className="dash-card-head">
        <span className="dash-eyebrow">Recent orders</span>
        <Link href="/account/orders">All orders →</Link>
      </div>
      {orders.map((o) => (
        <div key={o.id} className="order-row">
          <div>
            <div className="order-num">Order {o.shopifyOrderName}</div>
            <div className="order-info">
              {o.productLabel ?? "Mujo order"}
            </div>
            <div className="order-date">{formatLongDate(o.createdAt)}</div>
          </div>
          <div className="order-amount">
            {formatCents(o.amountCents, o.currency)}
          </div>
        </div>
      ))}
    </div>
  );
}

function SubscriberSavingsCard({
  savings,
  hasSub,
}: {
  savings: DashboardSavings;
  hasSub: boolean;
}) {
  if (!hasSub || savings.deliveryCount === 0) {
    return (
      <div className="dash-savings">
        <span className="dash-savings-eyebrow">Subscriber savings</span>
        <h3>
          Subscribe & save <em>25%.</em>
        </h3>
        <p>
          Every box ships at 25% off retail and free shipping is automatic over
          $100. Pause or skip anytime.
        </p>
        <div className="dash-savings-stat">
          <strong>0 deliveries</strong> yet · waiting for your first box
        </div>
      </div>
    );
  }

  const savedDollars = (savings.savedThisYearCents / 100).toFixed(0);
  const since = savings.memberSince ?? "—";

  return (
    <div className="dash-savings">
      <span className="dash-savings-eyebrow">Subscriber savings</span>
      <h3>
        ${savedDollars} saved <em>this year.</em>
      </h3>
      <p>
        You&rsquo;ve been on the subscription for{" "}
        {savings.deliveryCount === 1
          ? "your first delivery"
          : `${savings.deliveryCount} deliveries`}
        . Every box ships at 25% off retail and free shipping is automatic over
        $100.
      </p>
      <div className="dash-savings-stat">
        <strong>
          {savings.deliveryCount}{" "}
          {savings.deliveryCount === 1 ? "delivery" : "deliveries"}
        </strong>{" "}
        since {since} · Member since {since}
      </div>
    </div>
  );
}

function QuickActionsCard({ hasSub }: { hasSub: boolean }) {
  return (
    <div className="dash-card">
      <div className="dash-card-head">
        <span className="dash-eyebrow">Quick actions</span>
      </div>
      <div className="quick-actions">
        {hasSub ? (
          <Link href="/account/subscription" className="qa-link">
            <span className="qa-link-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="13 17 18 12 13 7" />
                <line x1="6" y1="12" x2="18" y2="12" />
              </svg>
            </span>
            <span className="qa-link-text">
              <strong>Skip next delivery</strong>
              <span>One tap. We&rsquo;ll bump it to the next cycle.</span>
            </span>
            <span className="qa-link-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="13 6 19 12 13 18" />
              </svg>
            </span>
          </Link>
        ) : null}
        <Link href="/account/profile" className="qa-link">
          <span className="qa-link-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
            </svg>
          </span>
          <span className="qa-link-text">
            <strong>Update your details</strong>
            <span>Name, email, marketing preferences.</span>
          </span>
          <span className="qa-link-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="13 6 19 12 13 18" />
            </svg>
          </span>
        </Link>
        <Link href="/contact" className="qa-link">
          <span className="qa-link-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
            </svg>
          </span>
          <span className="qa-link-text">
            <strong>Need a hand?</strong>
            <span>Real human, working-day reply.</span>
          </span>
          <span className="qa-link-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="13 6 19 12 13 18" />
            </svg>
          </span>
        </Link>
      </div>
    </div>
  );
}

function formatIntervalLabel(start: Date, end: Date): string {
  const diffDays = Math.round(
    (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays >= 25 && diffDays <= 35) return "Every 4 weeks";
  if (diffDays >= 85 && diffDays <= 95) return "Every 3 months";
  if (diffDays >= 360) return "Every year";
  if (diffDays >= 14 && diffDays <= 21) return "Every 2 weeks";
  return `Every ${diffDays} days`;
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}
