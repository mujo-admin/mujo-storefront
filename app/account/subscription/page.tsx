// /account/subscription — subscription management.
//
// Layout matches the canonical design at
// `context/import/New website build/mujo_account_subscription.html`:
//  - Sage "promise" banner
//  - Main subscription card (image + name + status pill)
//  - Orange "Next delivery" callout with "Skip this one" inline
//  - 4-field grid (Frequency / Quantity / Shipping to / Paying with)
//  - Quick changes section (4 actions)
//  - Pause / cancel "Need a break" zone
//
// Stripe API actions remain in `<SubscriptionControls />` client + the
// existing `/api/account/subscription/[action]` server route.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray } from "drizzle-orm";
import Stripe from "stripe";
import { customers, db, subscriptions } from "db";
import { stripe } from "lib/stripe";
import { getSession } from "lib/session";
import { resolvePriceId } from "lib/cart/price-id-map";
import { RITUAL_PRICE_IDS, SUBSCRIPTION_COUPON_ID } from "lib/stripe-constants";
import { AccountChrome } from "components/account/account-chrome";
import {
  SubscriptionControls,
  type SubscriptionDetail,
  type SwapOption,
} from "components/account/subscription-controls";

export const metadata: Metadata = {
  title: "Subscription",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ACTIVE_SUB_STATUSES = ["active", "trialing", "past_due", "paused"] as const;

export default async function SubscriptionPage() {
  const session = await getSession();
  if (!session) {
    redirect("/account/login");
  }

  const [rows, customerRow] = await Promise.all([
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
      .from(customers)
      .where(eq(customers.id, session.customerId))
      .limit(1),
  ]);

  const sub = rows[0];
  const customer = customerRow[0];

  if (!sub) {
    return (
      <AccountChrome
        activeTab="subscription"
        eyebrow="Account · Subscription"
        title="Your"
        titleAccent="subscription."
        lede="Skip, swap, change frequency, pause, or cancel — all in two taps."
        containerWidth="narrow"
      >
        <div className="sub-empty-card">
          <div className="sub-empty-illo">🍵</div>
          <h3>No active subscription</h3>
          <p>
            Subscribe & save 25% on every Ritual delivery. Pause or cancel
            anytime &mdash; no commitment, no cancellation fees, no questions.
          </p>
          <Link href="/products/mujo-ritual" className="sub-empty-cta">
            Start a subscription →
          </Link>
        </div>
        <SubStyle />
      </AccountChrome>
    );
  }

  // Read live Stripe state — single source of truth. The DB row is only
  // used to find the subscription ID (and as a fallback if Stripe is
  // unreachable). Reading live eliminates webhook-lag stale state after
  // the customer takes a sub-mgmt action.
  let stripeSub: Stripe.Subscription | null = null;
  try {
    stripeSub = (await stripe.subscriptions.retrieve(
      sub.stripeSubscriptionId,
      {
        expand: [
          "items.data.price",
          "default_payment_method",
          "discounts.source.coupon",
        ],
      },
    )) as Stripe.Subscription;
  } catch (err) {
    console.error("[subscription] stripe sub retrieve failed", err);
  }

  // All display fields derive from Stripe when available, with DB fallback.
  const status = stripeSub?.status ?? sub.status;
  const cancelAtPeriodEnd = stripeSub?.cancel_at_period_end ?? sub.cancelAtPeriodEnd;
  const pausedAt = stripeSub?.pause_collection ? new Date() : sub.pausedAt;
  const isPaused = Boolean(stripeSub?.pause_collection);
  const isCanceling = cancelAtPeriodEnd;

  const periodInfo = stripeSub
    ? {
        start: new Date(
          (stripeSub.items.data[0]?.current_period_start ??
            stripeSub.billing_cycle_anchor) * 1000,
        ),
        end: new Date(
          (stripeSub.items.data[0]?.current_period_end ??
            stripeSub.billing_cycle_anchor + 30 * 86400) * 1000,
        ),
      }
    : { start: sub.currentPeriodStart, end: sub.currentPeriodEnd };

  const livePriceId =
    stripeSub?.items.data[0]?.price.id ?? sub.stripePriceId;

  let unitAmountCents: number | null = null;
  let effectiveAmountCents: number | null = null;
  let discountPercent: number | null = null;
  let currency = "usd";
  let cardBrand: string | null = null;
  let cardLast4: string | null = null;
  let cardExpMonth: number | null = null;
  let cardExpYear: number | null = null;
  let shippingAddressLine: string | null = null;

  if (stripeSub) {
    const price = stripeSub.items.data[0]?.price;
    if (price) {
      unitAmountCents = price.unit_amount ?? null;
      currency = price.currency ?? "usd";
    }

    // Apply the subscription's first active discount (Stripe applies all
    // listed discounts to each invoice — for Mujo there's only one,
    // MUJO_SUB_15). Falls back to raw unit_amount if no discount.
    //
    // Dahlia API: `Discount.coupon` was moved to `Discount.source.coupon`.
    // Expand path is `discounts.source.coupon`.
    if (unitAmountCents !== null) {
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
        effectiveAmountCents = Math.round(
          unitAmountCents * (1 - coupon.percent_off / 100),
        );
      } else if (coupon && coupon.amount_off) {
        effectiveAmountCents = Math.max(0, unitAmountCents - coupon.amount_off);
      } else {
        effectiveAmountCents = unitAmountCents;
      }
    }

    const pm = stripeSub.default_payment_method;
    if (pm && typeof pm === "object" && pm.card) {
      cardBrand = pm.card.brand;
      cardLast4 = pm.card.last4;
      cardExpMonth = pm.card.exp_month;
      cardExpYear = pm.card.exp_year;
    }
  }

  // Fall back to Customer.invoice_settings.default_payment_method if the sub
  // didn't have its own (Stripe inherits from Customer when sub-level unset).
  if (!cardBrand && customer?.stripeCustomerId) {
    try {
      const stripeCustomer = await stripe.customers.retrieve(
        customer.stripeCustomerId,
        { expand: ["invoice_settings.default_payment_method"] },
      );
      if (
        stripeCustomer &&
        !(stripeCustomer as Stripe.DeletedCustomer).deleted
      ) {
        const c = stripeCustomer as Stripe.Customer;
        const defaultPm = c.invoice_settings?.default_payment_method;
        if (defaultPm && typeof defaultPm === "object" && defaultPm.card) {
          cardBrand = defaultPm.card.brand;
          cardLast4 = defaultPm.card.last4;
          cardExpMonth = defaultPm.card.exp_month;
          cardExpYear = defaultPm.card.exp_year;
        }
        const addr = c.shipping?.address ?? c.address;
        if (addr) {
          shippingAddressLine = [
            addr.line1,
            addr.line2,
            [addr.city, addr.state].filter(Boolean).join(", "),
            addr.postal_code,
          ]
            .filter(Boolean)
            .join(" · ");
        }
      }
    } catch (err) {
      console.error("[subscription] stripe customer retrieve failed", err);
    }
  }

  const meta = resolvePriceId(livePriceId, { isSubscription: true });
  const productLabel = meta
    ? `${meta.productTitle} · ${meta.variantTitle.replace(" · Subscribe & save", "")}`
    : "Mujo subscription";

  // Frequency label derived from price.recurring (canonical) — not from
  // (period_end - period_start) which compounds across pauses.
  const recurring = stripeSub?.items.data[0]?.price.recurring;
  const intervalLabel = recurring
    ? formatIntervalLabelFromRecurring(recurring)
    : "—";
  const intervalMeta = recurring
    ? formatIntervalMetaFromRecurring(recurring)
    : "";

  // Charge happens 2 days before period end (Stripe default smart retries).
  const chargeDate = new Date(periodInfo.end.getTime() - 2 * 24 * 60 * 60 * 1000);

  const detail: SubscriptionDetail = {
    stripeSubscriptionId: sub.stripeSubscriptionId,
    productLabel,
    status,
    stripePriceId: livePriceId,
    currentPeriodEnd: periodInfo.end.toISOString(),
    cancelAtPeriodEnd,
    pausedAt: pausedAt?.toISOString() ?? null,
    unitAmountCents,
    effectiveAmountCents,
    currency,
    createdAt: sub.createdAt.toISOString(),
  };

  const memberSinceLabel = sub.createdAt.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Build swap options — every Ritual subscription Price ID except the
  // current one. Subscription-only (one-time prices aren't valid swaps).
  const swapOptions = await buildSwapOptions(livePriceId);

  return (
    <AccountChrome
      activeTab="subscription"
      eyebrow="Account · Subscription"
      title="Your"
      titleAccent="subscription."
      lede='Skip, swap, change frequency, pause, cancel. All in two taps. No salt, no "are you sure?" maze.'
      containerWidth="narrow"
    >
      <div className="sub-wrap">
        {/* Promise banner */}
        <div className="sub-promise">
          <div className="sub-promise-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 12l2 2 4-4" />
              <circle cx="12" cy="12" r="10" />
            </svg>
          </div>
          <div className="sub-promise-text">
            <strong>The promise.</strong>
            Skip, swap, pause, or cancel anytime. One click, no salt, no
            five-step exit interview. We build subscriptions we&rsquo;d want
            to be on ourselves.
          </div>
        </div>

        {/* Main subscription card */}
        <div className="sub-main">
          <div className="sub-main-head">
            <div className="sub-main-img">🍵</div>
            <div className="sub-main-info">
              <h2>{productLabel}</h2>
              <p>Active since {memberSinceLabel}</p>
            </div>
            <div className={`sub-status-pill ${pillClass(status, isPaused, isCanceling)}`}>
              {pillLabel(status, isPaused, isCanceling)}
            </div>
          </div>

          {/* Next delivery callout */}
          <div className="next-delivery">
            <div className="next-delivery-text">
              <span className="acc-eyebrow-orange">
                {isCanceling ? "Ends" : isPaused ? "Paused until" : "Next delivery"}
              </span>
              <strong>{formatLongDate(periodInfo.end)}</strong>
              {!isPaused && !isCanceling ? (
                <span>
                  Charges your card on {formatShortDate(chargeDate)}. Ships from
                  our US warehouse.
                </span>
              ) : isPaused ? (
                <span>Resumes automatically. Resume manually anytime below.</span>
              ) : (
                <span>You&rsquo;ll keep access until this date.</span>
              )}
            </div>
          </div>

          {/* 4-field grid */}
          <div className="sub-fields">
            <div className="sub-field">
              <span className="sub-field-label">Frequency</span>
              <div className="sub-field-row">
                <div>
                  <div className="sub-field-value">{intervalLabel}</div>
                  <div className="sub-field-value-meta">{intervalMeta}</div>
                </div>
              </div>
            </div>

            <div className="sub-field">
              <span className="sub-field-label">Quantity</span>
              <div className="sub-field-row">
                <div>
                  <div className="sub-field-value">
                    1 bag · {meta?.variantTitle.includes("25") ? "25" : "10"} servings
                  </div>
                  <div className="sub-field-value-meta">
                    {effectiveAmountCents !== null && unitAmountCents !== null ? (
                      effectiveAmountCents < unitAmountCents ? (
                        <>
                          {formatCents(effectiveAmountCents, currency)} per delivery
                          {discountPercent !== null ? (
                            <>
                              {" "}
                              <span className="sub-field-strike">
                                {formatCents(unitAmountCents, currency)}
                              </span>
                              <span className="sub-field-discount">
                                {" "}
                                · {discountPercent}% off
                              </span>
                            </>
                          ) : null}
                        </>
                      ) : (
                        `${formatCents(unitAmountCents, currency)} per delivery`
                      )
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="sub-field">
              <span className="sub-field-label">Shipping to</span>
              <div className="sub-field-row">
                <div>
                  <div className="sub-field-value">{session.email}</div>
                  <div className="sub-field-value-meta">
                    {shippingAddressLine ?? "Set at checkout · United States"}
                  </div>
                </div>
                <Link href="/account/addresses" className="sub-field-edit">
                  Change
                </Link>
              </div>
            </div>

            <div className="sub-field">
              <span className="sub-field-label">Paying with</span>
              <div className="sub-field-row">
                <div>
                  <div className="sub-field-value">
                    {cardBrand && cardLast4
                      ? `${formatBrand(cardBrand)} · ${cardLast4}`
                      : "—"}
                  </div>
                  <div className="sub-field-value-meta">
                    {cardExpMonth && cardExpYear
                      ? `Expires ${String(cardExpMonth).padStart(2, "0")}/${String(cardExpYear).slice(-2)}`
                      : "Set at next checkout"}
                  </div>
                </div>
                <Link href="/account/payment-method" className="sub-field-edit">
                  Change
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Subscription controls — pause / skip / cancel / resume modals */}
        <SubscriptionControls
          detail={detail}
          swapOptions={swapOptions}
          senderEmail={session.email}
        />
      </div>

      <SubStyle />
    </AccountChrome>
  );
}

function SubStyle() {
  return (
    <style>{`
      .sub-wrap { padding-bottom: 80px; }

      /* Sage promise banner */
      .sub-promise {
        background: var(--sage);
        color: rgba(255, 255, 255, 0.85);
        border-radius: 14px;
        padding: 20px 24px;
        display: flex;
        align-items: flex-start;
        gap: 16px;
        margin-bottom: 24px;
      }
      .sub-promise-icon {
        flex-shrink: 0;
        width: 44px;
        height: 44px;
        background: rgba(242, 104, 47, 0.18);
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: var(--orange);
      }
      .sub-promise-icon svg { width: 22px; height: 22px; }
      .sub-promise-text {
        flex: 1;
        font-size: 14px;
        line-height: 1.55;
      }
      .sub-promise-text strong {
        color: #fff;
        font-weight: 500;
        display: block;
        margin-bottom: 4px;
        font-family: var(--f-display);
        font-size: 16px;
        letter-spacing: -0.01em;
      }

      /* Main subscription card */
      .sub-main {
        background: #fff;
        border: 1px solid rgba(26, 26, 26, 0.06);
        border-radius: 16px;
        padding: 24px;
        margin-bottom: 20px;
      }
      @media (min-width: 768px) {
        .sub-main { padding: 32px; }
      }
      .sub-main-head {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 16px;
        margin-bottom: 24px;
        align-items: center;
      }
      @media (min-width: 640px) {
        .sub-main-head { grid-template-columns: 80px 1fr auto; }
      }
      .sub-main-img {
        width: 64px;
        height: 64px;
        background: var(--sand);
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
        flex-shrink: 0;
      }
      @media (min-width: 640px) {
        .sub-main-img { width: 80px; height: 80px; font-size: 40px; }
      }
      .sub-main-info h2 {
        font-family: var(--f-display);
        font-size: 20px;
        font-weight: 500;
        margin: 0 0 4px;
        line-height: 1.25;
        letter-spacing: -0.01em;
        color: var(--ink);
      }
      .sub-main-info p {
        font-size: 13px;
        color: var(--ink-soft);
        margin: 0;
      }
      .sub-status-pill {
        font-family: var(--f-mono);
        font-size: 10px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        padding: 5px 12px;
        border-radius: 100px;
        font-weight: 500;
        align-self: start;
        grid-column: 1 / -1;
        justify-self: start;
      }
      @media (min-width: 640px) {
        .sub-status-pill { grid-column: auto; align-self: center; justify-self: end; }
      }
      .sub-status-pill.active { background: rgba(47, 61, 51, 0.08); color: var(--sage); }
      .sub-status-pill.paused { background: rgba(242, 169, 47, 0.16); color: #8b5a07; }
      .sub-status-pill.canceling { background: rgba(220, 90, 70, 0.14); color: #9b3d2c; }
      .sub-status-pill.past_due { background: rgba(220, 90, 70, 0.18); color: #9b3d2c; }

      /* Next delivery callout */
      .next-delivery {
        background: linear-gradient(135deg, rgba(242, 104, 47, 0.08) 0%, rgba(242, 104, 47, 0.03) 100%);
        border: 1px solid rgba(242, 104, 47, 0.2);
        border-radius: 12px;
        padding: 16px 20px;
        margin-bottom: 24px;
      }
      .next-delivery-text { display: flex; flex-direction: column; gap: 4px; }
      .acc-eyebrow-orange {
        font-family: var(--f-mono);
        font-size: 11px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: var(--orange-deep);
        font-weight: 500;
      }
      .next-delivery-text strong {
        font-family: var(--f-display);
        font-size: 19px;
        font-weight: 500;
        letter-spacing: -0.01em;
        color: var(--ink);
      }
      .next-delivery-text > span:not(.acc-eyebrow-orange) {
        font-size: 13px;
        color: var(--ink-soft);
      }

      /* Field grid */
      .sub-fields {
        display: grid;
        grid-template-columns: 1fr;
        gap: 16px;
      }
      @media (min-width: 640px) {
        .sub-fields { grid-template-columns: 1fr 1fr; }
      }
      .sub-field {
        padding: 16px;
        background: var(--cream);
        border-radius: 10px;
      }
      .sub-field-label {
        display: block;
        font-family: var(--f-mono);
        font-size: 10px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--mute);
        margin-bottom: 6px;
        font-weight: 500;
      }
      .sub-field-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .sub-field-value {
        font-size: 15px;
        font-weight: 500;
        line-height: 1.3;
        color: var(--ink);
      }
      .sub-field-value-meta {
        font-size: 12px;
        color: var(--ink-soft);
        margin-top: 2px;
      }
      .sub-field-strike {
        text-decoration: line-through;
        opacity: 0.55;
      }
      .sub-field-discount {
        color: var(--orange-deep);
        font-weight: 500;
      }
      .sub-field-edit {
        background: transparent;
        border: none;
        cursor: pointer;
        font-family: var(--f-mono);
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--orange-deep);
        padding: 4px 8px;
        flex-shrink: 0;
        font-weight: 500;
        text-decoration: none;
      }
      .sub-field-edit:hover { color: var(--orange); }

      /* Empty state */
      .sub-empty-card {
        background: #fff;
        border: 1px solid rgba(26, 26, 26, 0.06);
        border-radius: 14px;
        padding: 64px 32px;
        text-align: center;
      }
      .sub-empty-illo {
        font-size: 56px;
        opacity: 0.4;
        margin-bottom: 16px;
      }
      .sub-empty-card h3 {
        font-family: var(--f-display);
        font-size: 22px;
        font-weight: 500;
        margin: 0 0 8px;
        letter-spacing: -0.01em;
        color: var(--ink);
      }
      .sub-empty-card p {
        font-size: 14px;
        color: var(--ink-soft);
        line-height: 1.55;
        margin: 0 auto 22px;
        max-width: 420px;
      }
      .sub-empty-cta {
        display: inline-block;
        background: var(--orange);
        color: #fff;
        text-decoration: none;
        padding: 12px 22px;
        border-radius: 100px;
        font-size: 14px;
        font-weight: 500;
      }
      .sub-empty-cta:hover { background: var(--orange-deep); }
    `}</style>
  );
}

function pillClass(status: string, isPaused: boolean, isCanceling: boolean): string {
  if (isPaused) return "paused";
  if (isCanceling) return "canceling";
  if (status === "past_due" || status === "unpaid") return "past_due";
  return "active";
}

function pillLabel(status: string, isPaused: boolean, isCanceling: boolean): string {
  if (isPaused) return "Paused";
  if (isCanceling) return "Cancels at period end";
  if (status === "past_due") return "Payment overdue";
  // `trialing` is an artifact of skip-next + send-now's trial_end mechanics —
  // Mujo doesn't have a customer-facing trial concept. Treat as Active.
  return "Active";
}

function formatIntervalLabelFromRecurring(
  recurring: Stripe.Price.Recurring,
): string {
  const count = recurring.interval_count ?? 1;
  const interval = recurring.interval;
  if (interval === "month" && count === 1) return "Every 4 weeks";
  if (interval === "month" && count === 3) return "Every 3 months";
  if (interval === "month") return `Every ${count} months`;
  if (interval === "week" && count === 1) return "Weekly";
  if (interval === "week" && count === 2) return "Every 2 weeks";
  if (interval === "week") return `Every ${count} weeks`;
  if (interval === "year") return count === 1 ? "Yearly" : `Every ${count} years`;
  if (interval === "day") return count === 1 ? "Daily" : `Every ${count} days`;
  return `Every ${count} ${interval}${count === 1 ? "" : "s"}`;
}

function formatIntervalMetaFromRecurring(
  recurring: Stripe.Price.Recurring,
): string {
  const count = recurring.interval_count ?? 1;
  const cyclesPerYear = (() => {
    if (recurring.interval === "month") return Math.round(12 / count);
    if (recurring.interval === "week") return Math.round(52 / count);
    if (recurring.interval === "year") return 1;
    if (recurring.interval === "day") return Math.round(365 / count);
    return 12;
  })();
  return `~${cyclesPerYear} ${cyclesPerYear === 1 ? "delivery" : "deliveries"} per year`;
}

function formatLongDate(d: Date): string {
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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatBrand(brand: string): string {
  if (!brand) return "Card";
  const lower = brand.toLowerCase();
  if (lower === "amex") return "American Express";
  if (lower === "mastercard") return "Mastercard";
  if (lower === "visa") return "Visa";
  if (lower === "discover") return "Discover";
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

/**
 * Build the list of Ritual subscription Price IDs the customer can swap into,
 * excluding the current one. Fetches each Price's unit_amount from Stripe so
 * the swap modal shows live pricing (with the standing 15% sub coupon
 * estimate applied for the per-delivery label).
 */
async function buildSwapOptions(currentPriceId: string): Promise<SwapOption[]> {
  const subPriceIds = [
    RITUAL_PRICE_IDS["10-subscription"],
    RITUAL_PRICE_IDS["25-subscription"],
  ].filter((id) => id.length > 0 && id !== currentPriceId);

  if (subPriceIds.length === 0) return [];

  // Fetch live Price data (unit_amount, currency) in parallel.
  const prices = await Promise.all(
    subPriceIds.map((id) =>
      stripe.prices.retrieve(id).catch((err) => {
        console.error("[subscription] price retrieve failed", { id, err });
        return null;
      }),
    ),
  );

  // Standing subscription coupon: 15% off forever — applied at checkout.
  // For display in the swap modal, show the post-coupon per-delivery price
  // since that's what the customer will actually see charged.
  const couponDiscount = SUBSCRIPTION_COUPON_ID ? 0.15 : 0;

  const options: SwapOption[] = [];
  for (const price of prices) {
    if (!price || !price.unit_amount) continue;
    const meta = resolvePriceId(price.id, { isSubscription: true });
    const label = meta
      ? `${meta.productTitle} · ${meta.variantTitle.replace(" · Subscribe & save", "")}`
      : "Mujo subscription";
    const effectiveCents = Math.round(price.unit_amount * (1 - couponDiscount));
    const priceLabel = `${new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(effectiveCents / 100)} per delivery`;
    options.push({
      priceId: price.id,
      label,
      priceLabel,
    });
  }

  return options;
}
