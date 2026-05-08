// /account/profile — name + email + Klaviyo email-prefs single master toggle.
//
// Server component: gates on session, fetches Stripe Customer.name +
// Klaviyo consent state, hands to client form. Name lives in Stripe Customer
// (single source of truth per plan §5.4 — no schema churn).

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { customers, db } from "db";
import { stripe } from "lib/stripe";
import { getSession } from "lib/session";
import { getEmailMarketingConsent } from "lib/klaviyo";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = {
  title: "Profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session) {
    redirect("/account/login");
  }

  const customerRow = (
    await db
      .select()
      .from(customers)
      .where(eq(customers.id, session.customerId))
      .limit(1)
  )[0];

  let firstName = "";
  let lastName = "";
  if (customerRow?.stripeCustomerId) {
    try {
      const stripeCustomer = await stripe.customers.retrieve(
        customerRow.stripeCustomerId,
      );
      if (
        stripeCustomer &&
        !(stripeCustomer as Stripe.DeletedCustomer).deleted
      ) {
        const name = (stripeCustomer as Stripe.Customer).name ?? "";
        if (name) {
          const parts = name.trim().split(/\s+/);
          firstName = parts[0] ?? "";
          lastName = parts.slice(1).join(" ");
        }
      }
    } catch (err) {
      console.error("[profile] stripe customer retrieve failed", err);
    }
  }

  const marketingConsent = await getEmailMarketingConsent(session.email);

  return (
    <div className="profile-shell">
      <div className="profile-shell-inner">
        <Link href="/account" className="profile-back">
          ← Back to account
        </Link>
        <h1 className="profile-title">
          Your <em>profile</em>
        </h1>
        <p className="profile-lede">
          Update your name, email address, and email preferences. Email changes
          require confirmation from the new address.
        </p>

        <ProfileForm
          initialFirstName={firstName}
          initialLastName={lastName}
          initialEmail={session.email}
          initialMarketingConsent={
            marketingConsent === "subscribed" || marketingConsent === "unsubscribed"
              ? marketingConsent
              : "subscribed"
          }
        />
      </div>

      <style>{`
        .profile-shell {
          background: var(--cream);
          min-height: calc(100vh - 100px);
          font-family: var(--f-body);
          color: var(--ink);
        }
        .profile-shell-inner {
          max-width: 620px;
          margin: 0 auto;
          padding: 40px 20px 80px;
        }
        .profile-back {
          display: inline-block;
          font-family: var(--f-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          color: var(--ink-soft);
          text-decoration: none;
          margin-bottom: 24px;
        }
        .profile-back:hover { color: var(--orange-deep); }
        .profile-title {
          font-family: var(--f-display);
          font-size: 30px;
          font-weight: 500;
          letter-spacing: -0.01em;
          margin: 0 0 8px;
          line-height: 1.15;
        }
        .profile-title em {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
          color: var(--orange-deep);
          font-weight: 400;
        }
        .profile-lede {
          font-size: 14px;
          color: var(--ink-soft);
          line-height: 1.55;
          margin: 0 0 28px;
        }
        @media (max-width: 600px) {
          .profile-shell-inner { padding: 28px 14px 60px; }
          .profile-title { font-size: 24px; }
        }
      `}</style>
    </div>
  );
}
