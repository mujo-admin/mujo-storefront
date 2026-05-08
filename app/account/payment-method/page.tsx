// /account/payment-method — update default card via SetupIntent.
//
// Server component: gates on session, fetches current default card from
// Stripe Customer.invoice_settings.default_payment_method, hands to client
// form. The form mounts <Elements /> with PaymentElement when "Update card"
// is clicked, confirms the SetupIntent, then PATCHes back to the server to
// promote the new PM to default + propagate to active subscriptions.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { customers, db } from "db";
import { stripe } from "lib/stripe";
import { getSession } from "lib/session";
import { PaymentMethodForm, type CurrentCard } from "components/account/payment-method-form";

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

  const hasStripeCustomer = customerRow?.stripeCustomerId !== null && customerRow?.stripeCustomerId !== undefined;

  return (
    <div className="pm-shell">
      <Link href="/account" className="pm-back">
        ← Back to account
      </Link>
      <h1 className="pm-title">
        Payment <em>method</em>
      </h1>

      {updated ? (
        <div className="pm-banner">
          <strong>Card updated.</strong>
          <span>Your new card is now used for all future charges.</span>
        </div>
      ) : null}

      {hasStripeCustomer ? (
        <PaymentMethodForm currentCard={currentCard} />
      ) : (
        <div className="pm-empty">
          <p>
            You haven&apos;t completed a checkout yet, so there&apos;s nothing
            to update. Once you place an order or start a subscription, your
            card details will be available here.
          </p>
          <Link href="/products/mujo-ritual" className="pm-cta">
            Start a subscription →
          </Link>
        </div>
      )}

      <style>{`
        .pm-shell {
          max-width: 580px;
          margin: 0 auto;
          padding: 40px 20px 80px;
          font-family: var(--f-body);
          color: var(--ink);
        }
        .pm-back {
          display: inline-block;
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--ink-soft);
          text-decoration: none;
          margin-bottom: 24px;
        }
        .pm-back:hover { color: var(--orange-deep); }
        .pm-title {
          font-family: var(--f-display);
          font-size: 30px;
          font-weight: 500;
          letter-spacing: -0.01em;
          margin: 0 0 24px;
          line-height: 1.15;
        }
        .pm-title em {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
          color: var(--orange-deep);
          font-weight: 400;
        }
        .pm-banner {
          background: rgba(124, 167, 124, 0.12);
          border-radius: 12px;
          padding: 14px 16px;
          margin-bottom: 22px;
          font-size: 13px;
          color: #4d6f4d;
          line-height: 1.5;
        }
        .pm-banner strong {
          display: block;
          margin-bottom: 2px;
          color: #3d5a3d;
        }
        .pm-empty {
          background: var(--cream);
          border-radius: 14px;
          padding: 28px 24px;
        }
        .pm-empty p {
          font-size: 14px;
          color: var(--ink-soft);
          line-height: 1.55;
          margin: 0 0 16px;
        }
        .pm-cta {
          font-family: var(--f-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
          color: var(--orange-deep);
          text-decoration: none;
        }
        .pm-cta:hover { color: var(--orange); }
        @media (max-width: 600px) {
          .pm-shell { padding: 28px 14px 60px; }
          .pm-title { font-size: 24px; }
        }
      `}</style>
    </div>
  );
}
