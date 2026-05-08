// /account/profile — name + email + Klaviyo email-prefs single master toggle.
//
// Server component: gates on session, fetches Stripe Customer.name +
// Klaviyo consent state, hands to client form. Name lives in Stripe
// Customer (single source of truth per plan §5.4 — no schema churn).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { customers, db } from "db";
import { stripe } from "lib/stripe";
import { getSession } from "lib/session";
import { getEmailMarketingConsent } from "lib/klaviyo";
import { AccountChrome } from "components/account/account-chrome";
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
    <AccountChrome
      activeTab="profile"
      eyebrow="Account · Profile"
      title="Your"
      titleAccent="profile."
      lede="Update your name, email address, and email preferences. Email changes require confirmation from the new address."
      containerWidth="narrow"
    >
      <div className="profile-wrap">
        <ProfileForm
          initialFirstName={firstName}
          initialLastName={lastName}
          initialEmail={session.email}
          initialMarketingConsent={
            marketingConsent === "subscribed" ? "subscribed" : "unsubscribed"
          }
        />
      </div>

      <style>{`
        .profile-wrap {
          padding-bottom: 80px;
        }
      `}</style>
    </AccountChrome>
  );
}
