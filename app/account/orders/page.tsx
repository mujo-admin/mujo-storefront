// /account/orders — paginated order history.
//
// Reads orderMirror by customer_id, 20 per page. Each row shows date, name,
// type pill (one-time / subscription_initial / subscription_renewal), and
// total. Renders detail inline rather than deep-linking to Shopify — see
// implementation notes for the URL-pattern decision.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db, orderMirror } from "db";
import { getSession } from "lib/session";

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

  const [orders, totalResult] = await Promise.all([
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
  ]);

  const total = totalResult[0]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = pageNum > 1;
  const hasNext = pageNum < totalPages;

  if (orders.length === 0 && pageNum === 1) {
    return (
      <div className="orders-shell">
        <div className="orders-shell-inner">
          <BackLink />
          <h1 className="orders-title">
            Your <em>orders</em>
          </h1>
          <div className="orders-empty">
            <p>No orders yet.</p>
            <Link href="/shop" className="orders-cta">
              Browse the shop →
            </Link>
          </div>
        </div>
        <OrdersStyle />
      </div>
    );
  }

  return (
    <div className="orders-shell">
      <div className="orders-shell-inner">
        <BackLink />
        <h1 className="orders-title">
          Your <em>orders</em>
        </h1>
        <p className="orders-meta">
          {total} order{total === 1 ? "" : "s"} on file.
        </p>

        <ul className="orders-list">
        {orders.map((o) => (
          <li key={o.id} className="order-row">
            <div className="order-row-main">
              <div className="order-row-date">
                {formatDate(o.createdAt)}
              </div>
              <div className="order-row-name">{o.shopifyOrderName}</div>
              <div className="order-row-type">
                <TypePill type={o.type} />
              </div>
            </div>
            <div className="order-row-amount">
              {formatCents(o.amountCents, o.currency)}
            </div>
          </li>
        ))}
      </ul>

      {totalPages > 1 ? (
        <nav className="orders-pagination" aria-label="Order pagination">
          {hasPrev ? (
            <Link href={`/account/orders?page=${pageNum - 1}`} className="page-link">
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
            <Link href={`/account/orders?page=${pageNum + 1}`} className="page-link">
              Next →
            </Link>
          ) : (
            <span className="page-link disabled" aria-hidden>
              Next →
            </span>
          )}
        </nav>
      ) : null}
      </div>

      <OrdersStyle />
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/account" className="orders-back">
      ← Back to account
    </Link>
  );
}

function TypePill({ type }: { type: string }) {
  if (type === "one_time") {
    return <span className="type-pill onetime">One-time</span>;
  }
  if (type === "subscription_initial") {
    return <span className="type-pill subscription">Subscription · first</span>;
  }
  if (type === "subscription_renewal") {
    return <span className="type-pill subscription">Subscription · renewal</span>;
  }
  if (type === "subscription_update") {
    return <span className="type-pill subscription">Subscription · change</span>;
  }
  return <span className="type-pill onetime">{type}</span>;
}

function formatDate(d: Date): string {
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

function OrdersStyle() {
  return (
    <style>{`
      .orders-shell {
        background: var(--cream);
        min-height: calc(100vh - 100px);
        font-family: var(--f-body);
        color: var(--ink);
      }
      .orders-shell-inner {
        max-width: 760px;
        margin: 0 auto;
        padding: 40px 20px 80px;
      }
      .orders-back {
        display: inline-block;
        font-family: var(--f-mono);
        font-size: 11px;
        letter-spacing: 0.06em;
        color: var(--ink-soft);
        text-decoration: none;
        margin-bottom: 24px;
      }
      .orders-back:hover { color: var(--orange-deep); }
      .orders-title {
        font-family: var(--f-display);
        font-size: 30px;
        font-weight: 500;
        letter-spacing: -0.01em;
        margin: 0 0 8px;
        line-height: 1.15;
      }
      .orders-title em {
        font-family: 'Instrument Serif', Georgia, serif;
        font-style: italic;
        color: var(--orange-deep);
        font-weight: 400;
      }
      .orders-meta {
        font-family: var(--f-mono);
        font-size: 12px;
        letter-spacing: 0.04em;
        color: var(--mute);
        margin: 0 0 24px;
      }
      .orders-empty {
        background: var(--cream);
        border-radius: 14px;
        padding: 36px 24px;
        text-align: center;
      }
      .orders-empty p {
        margin: 0 0 14px;
        color: var(--ink-soft);
      }
      .orders-cta {
        font-family: var(--f-mono);
        font-size: 12px;
        letter-spacing: 0.04em;
        color: var(--orange-deep);
        text-decoration: none;
      }
      .orders-cta:hover { color: var(--orange); }
      .orders-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 1px;
        background: var(--line);
        border-radius: 12px;
        overflow: hidden;
      }
      .order-row {
        background: var(--cream);
        padding: 18px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
      }
      .order-row-main {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .order-row-date {
        font-family: var(--f-mono);
        font-size: 11px;
        letter-spacing: 0.04em;
        color: var(--mute);
      }
      .order-row-name {
        font-size: 15px;
        font-weight: 500;
        color: var(--ink);
      }
      .order-row-type { margin-top: 2px; }
      .order-row-amount {
        font-size: 15px;
        font-weight: 500;
        font-variant-numeric: tabular-nums;
        color: var(--ink);
        flex-shrink: 0;
      }
      .type-pill {
        display: inline-block;
        font-family: var(--f-mono);
        font-size: 10px;
        letter-spacing: 0.06em;
        padding: 3px 9px;
        border-radius: 999px;
        text-transform: uppercase;
      }
      .type-pill.onetime { background: rgba(0,0,0,0.06); color: var(--ink-soft); }
      .type-pill.subscription { background: rgba(242,104,47,0.12); color: var(--orange-deep); }
      .orders-pagination {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 28px;
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
      @media (max-width: 600px) {
        .orders-shell-inner { padding: 28px 14px 60px; }
        .orders-title { font-size: 24px; }
        .order-row { padding: 14px 16px; }
      }
    `}</style>
  );
}
