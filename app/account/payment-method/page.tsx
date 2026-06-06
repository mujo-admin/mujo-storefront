// /account/payment-method — update default card via SetupIntent.
//
// Reached via /account/subscription's "Paying with · Change" link. Shares
// the AccountChrome with subscription as the active tab.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { customers, db } from "db";
import { stripe } from "lib/stripe";
import { getSession } from "lib/session";
import { AccountChrome } from "components/account/account-chrome";
import {
  PaymentMethodForm,
  type CurrentCard,
} from "components/account/payment-method-form";

export const metadata: Metadata = {
  title: "Payment method",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type SearchParams = { [k: string]: string | string[] | undefined };

export default async function PaymentMethodPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/account/login");
  }

  const params = await searchParams;
  const updated = params.updated === "1";

  const customerRow = (
    await db
      .select()
      .from(customers)
      .where(eq(customers.id, session.customerId))
      .limit(1)
  )[0];

  let currentCard: CurrentCard | null = null;
  if (customerRow?.stripeCustomerId) {
    try {
      const stripeCustomer = await stripe.customers.retrieve(
        customerRow.stripeCustomerId,
        { expand: ["invoice_settings.default_payment_method"] },
      );
      if (
        stripeCustomer &&
        !(stripeCustomer as Stripe.DeletedCustomer).deleted
      ) {
        const c = stripeCustomer as Stripe.Customer;
        const defaultPm = c.invoice_settings?.default_payment_method;
        const pm =
          typeof defaultPm === "object" && defaultPm !== null
            ? (defaultPm as Stripe.PaymentMethod)
            : null;
        if (pm && pm.card) {
          currentCard = {
            brand: pm.card.brand,
            last4: pm.card.last4,
            expMonth: pm.card.exp_month,
            expYear: pm.card.exp_year,
          };
        }
      }
    } catch (err) {
      console.error("[payment-method] stripe customer retrieve failed", err);
    }
  }

  const hasStripeCustomer = Boolean(customerRow?.stripeCustomerId);

  return (
    <AccountChrome
      activeTab="subscription"
      eyebrow="Account · Payment method"
      title="Payment"
      titleAccent="method."
      lede="Update your default card. Saved securely with Stripe — Mujo never sees the card number."
      containerWidth="narrow"
    >
      <div className="pm-wrap">
        <Link href="/account/subscription" className="pm-back-link">
          ← Back to subscription
        </Link>

        {updated ? (
          <div className="pm-banner">
            <strong>Card updated.</strong>
            <span>Your new card is now used for all future charges.</span>
          </div>
        ) : null}

        {hasStripeCustomer ? (
          <div className="pm-card-wrap">
            <PaymentMethodForm currentCard={currentCard} />
          </div>
        ) : (
          <div className="pm-empty">
            <div className="pm-empty-illo"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 9.5h19" /></svg></div>
            <h3>No card on file yet</h3>
            <p>
              You haven&rsquo;t completed a checkout yet, so there&rsquo;s
              nothing to update. Once you place an order or start a
              subscription, your card details will be available here.
            </p>
            <Link href="/products/mujo-ritual" className="pm-empty-cta">
              Start a subscription →
            </Link>
          </div>
        )}
      </div>

      <style>{`
        .pm-wrap { padding-bottom: 80px; }
        .pm-back-link {
          display: inline-block;
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--ink-soft);
          text-decoration: none;
          margin-bottom: 18px;
        }
        .pm-back-link:hover { color: var(--orange-deep); }

        .pm-banner {
          background: rgba(124, 167, 124, 0.12);
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 18px;
          font-size: 13px;
          color: #4d6f4d;
          line-height: 1.5;
        }
        .pm-banner strong {
          display: block;
          margin-bottom: 2px;
          color: #3d5a3d;
        }

        .pm-card-wrap {
          background: #fff;
          border: 1px solid rgba(26, 26, 26, 0.06);
          border-radius: 16px;
          padding: 24px;
        }
        @media (min-width: 768px) {
          .pm-card-wrap { padding: 32px; }
        }

        .pm-empty {
          background: #fff;
          border: 1px solid rgba(26, 26, 26, 0.06);
          border-radius: 14px;
          padding: 56px 32px;
          text-align: center;
        }
        .pm-empty-illo {
          font-size: 48px;
          opacity: 0.4;
          margin-bottom: 14px;
        }
        .pm-empty h3 {
          font-family: var(--f-display);
          font-size: 22px;
          font-weight: 500;
          margin: 0 0 8px;
          letter-spacing: -0.01em;
          color: var(--ink);
        }
        .pm-empty p {
          font-size: 14px;
          color: var(--ink-soft);
          line-height: 1.55;
          margin: 0 auto 22px;
          max-width: 380px;
        }
        .pm-empty-cta {
          display: inline-block;
          background: var(--orange);
          color: #fff;
          text-decoration: none;
          padding: 12px 22px;
          border-radius: 100px;
          font-size: 14px;
          font-weight: 500;
        }
        .pm-empty-cta:hover { background: var(--orange-deep); }
      `}</style>
    </AccountChrome>
  );
}
