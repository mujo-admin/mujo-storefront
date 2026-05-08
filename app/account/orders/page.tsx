// /account/orders — paginated order history.
//
// Layout matches the canonical design at
// `context/import/New website build/mujo_account_orders.html`. Each order
// renders as a full `.order-card` (head with order # + date + status pill,
// items list with line images, foot with total + actions).
//
// MVP simplifications vs. canonical design:
//  - Single line item per order (we don't mirror individual line items in
//    orderMirror; we render the resolved Stripe Price metadata instead).
//  - Status pill shown as type-derived (Subscription / One-time) rather
//    than fulfillment status (Delivered / In transit) — Shopify Fulfillment
//    integration is post-MVP.
//  - "Track" / "Reorder" / "View receipt" buttons hidden until those flows
//    ship in v2.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db, orderMirror, subscriptions } from "db";
import { getSession } from "lib/session";
import { resolvePriceId } from "lib/cart/price-id-map";
import { AccountChrome } from "components/account/account-chrome";

export const metadata: Metadata = {
  title: "Orders",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

type SearchParams = { [k: string]: string | string[] | undefined };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/account/login");
  }

  const params = await searchParams;
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const pageNum = Math.max(1, Number.parseInt(rawPage ?? "1", 10) || 1);
  const offset = (pageNum - 1) * PAGE_SIZE;

  const [orders, totalResult, anySub] = await Promise.all([
    db
      .select()
      .from(orderMirror)
      .where(eq(orderMirror.customerId, session.customerId))
      .orderBy(desc(orderMirror.createdAt))
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(orderMirror)
      .where(eq(orderMirror.customerId, session.customerId)),
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.customerId, session.customerId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1),
  ]);

  const total = totalResult[0]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = pageNum > 1;
  const hasNext = pageNum < totalPages;
  const subPriceId = anySub[0]?.stripePriceId ?? null;

  const isEmpty = orders.length === 0 && pageNum === 1;

  return (
    <AccountChrome
      activeTab="orders"
      eyebrow="Account · Orders"
      title="Your"
      titleAccent="orders."
      lede="Everything you've bought. Subscription renewals and one-time orders, all in one place."
      containerWidth="narrow"
    >
      <div className="orders-wrap">
        {isEmpty ? (
          <div className="empty-orders">
            <div className="empty-orders-illo">🍵</div>
            <h3>No orders yet</h3>
            <p>
              Once you place your first order, you&rsquo;ll see it here with
              receipts and tracking.
            </p>
            <Link href="/shop" className="empty-orders-cta">
              Browse the shop →
            </Link>
          </div>
        ) : (
          <>
            <p className="orders-meta">
              {total} order{total === 1 ? "" : "s"} on file.
            </p>

            {orders.map((o) => {
              const isSubscription = o.type.startsWith("subscription");
              const lineMeta = isSubscription && subPriceId
                ? resolvePriceId(subPriceId, { isSubscription: true })
                : null;
              const lineName = lineMeta
                ? `${lineMeta.productTitle} · ${lineMeta.variantTitle
                    .replace(" · Subscribe & save", "")
                    .replace(" · One-time", "")}`
                : "Mujo order";
              const typeLabel = isSubscription
                ? o.type === "subscription_initial"
                  ? "Subscription · first"
                  : o.type === "subscription_renewal"
                    ? "Subscription · renewal"
                    : "Subscription · change"
                : "One-time";

              return (
                <article key={o.id} className="order-card">
                  <header className="order-card-head">
                    <div>
                      <div className="order-card-num">
                        Order {o.shopifyOrderName}
                      </div>
                      <div className="order-card-date">
                        {formatLongDate(o.createdAt)}{" "}
                        <span>· {typeLabel}</span>
                      </div>
                    </div>
                  </header>

                  <div className="order-items">
                    <div className="order-line">
                      <div className="order-line-img">🍵</div>
                      <div className="order-line-info">
                        <div className="order-line-name">{lineName}</div>
                        <div className="order-line-meta">
                          {isSubscription ? "Subscription" : "One-time"} · Qty 1
                        </div>
                      </div>
                      <div className="order-line-price">
                        {formatCents(o.amountCents, o.currency)}
                      </div>
                    </div>
                  </div>

                  <footer className="order-foot">
                    <div className="order-totals">
                      <span>Total</span>
                      <strong>{formatCents(o.amountCents, o.currency)}</strong>
                    </div>
                  </footer>
                </article>
              );
            })}

            {totalPages > 1 ? (
              <nav className="orders-pagination" aria-label="Order pagination">
                {hasPrev ? (
                  <Link
                    href={`/account/orders?page=${pageNum - 1}`}
                    className="page-link"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span className="page-link disabled" aria-hidden>
                    ← Previous
                  </span>
                )}
                <span className="page-indicator">
                  Page {pageNum} of {totalPages}
                </span>
                {hasNext ? (
                  <Link
                    href={`/account/orders?page=${pageNum + 1}`}
                    className="page-link"
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="page-link disabled" aria-hidden>
                    Next →
                  </span>
                )}
              </nav>
            ) : null}
          </>
        )}
      </div>

      <style>{`
        .orders-wrap { padding-bottom: 80px; }

        .orders-meta {
          font-family: var(--f-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
          color: var(--mute);
          margin: 0 0 18px;
        }

        .order-card {
          background: #fff;
          border: 1px solid rgba(26, 26, 26, 0.06);
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 16px;
        }
        @media (min-width: 768px) {
          .order-card { padding: 24px 28px; }
        }
        .order-card-head {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          padding-bottom: 16px;
          border-bottom: 1px solid rgba(26, 26, 26, 0.06);
          margin-bottom: 16px;
        }
        .order-card-num {
          font-family: var(--f-mono);
          font-size: 12px;
          letter-spacing: 0.06em;
          color: var(--mute);
          margin-bottom: 4px;
        }
        .order-card-date {
          font-size: 14px;
          font-weight: 500;
          color: var(--ink);
        }
        .order-card-date span {
          font-family: var(--f-mono);
          font-size: 11px;
          color: var(--mute);
          margin-left: 8px;
          letter-spacing: 0.04em;
          font-weight: 400;
        }

        .order-items {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-bottom: 16px;
        }
        .order-line {
          display: grid;
          grid-template-columns: 56px 1fr auto;
          gap: 14px;
          align-items: center;
        }
        .order-line-img {
          width: 56px;
          height: 56px;
          background: var(--sand);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 26px;
          flex-shrink: 0;
        }
        .order-line-info { min-width: 0; }
        .order-line-name {
          font-size: 14px;
          font-weight: 500;
          line-height: 1.3;
          margin-bottom: 2px;
          color: var(--ink);
        }
        .order-line-meta {
          font-size: 12px;
          color: var(--ink-soft);
        }
        .order-line-price {
          font-family: var(--f-mono);
          font-size: 13px;
          font-weight: 500;
          text-align: right;
          flex-shrink: 0;
          color: var(--ink);
          font-variant-numeric: tabular-nums;
        }

        .order-foot {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-top: 16px;
          border-top: 1px solid rgba(26, 26, 26, 0.06);
        }
        @media (min-width: 640px) {
          .order-foot { flex-direction: row; justify-content: space-between; align-items: center; }
        }
        .order-totals {
          display: flex;
          align-items: baseline;
          gap: 12px;
          font-size: 13px;
          color: var(--ink-soft);
        }
        .order-totals strong {
          color: var(--ink);
          font-weight: 500;
          font-family: var(--f-mono);
        }

        .empty-orders {
          text-align: center;
          padding: 64px 24px;
          background: #fff;
          border: 1px solid rgba(26, 26, 26, 0.06);
          border-radius: 14px;
        }
        .empty-orders-illo {
          font-size: 56px;
          opacity: 0.4;
          margin-bottom: 16px;
        }
        .empty-orders h3 {
          font-family: var(--f-display);
          font-size: 22px;
          font-weight: 500;
          margin: 0 0 8px;
          letter-spacing: -0.01em;
        }
        .empty-orders p {
          font-size: 14px;
          color: var(--ink-soft);
          max-width: 320px;
          margin: 0 auto 20px;
          line-height: 1.55;
        }
        .empty-orders-cta {
          display: inline-block;
          background: var(--orange);
          color: #fff;
          text-decoration: none;
          padding: 12px 22px;
          border-radius: 100px;
          font-size: 14px;
          font-weight: 500;
        }
        .empty-orders-cta:hover { background: var(--orange-deep); }

        .orders-pagination {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 20px;
          padding: 16px 4px;
        }
        .page-link {
          font-family: var(--f-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
          color: var(--ink-soft);
          text-decoration: none;
        }
        .page-link:hover { color: var(--orange-deep); }
        .page-link.disabled {
          opacity: 0.35;
          pointer-events: none;
        }
        .page-indicator {
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.04em;
          color: var(--mute);
        }
      `}</style>
    </AccountChrome>
  );
}

function formatLongDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "long",
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
