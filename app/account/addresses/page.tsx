// /account/addresses — single editable shipping address.
//
// Mujo ships US-only (per project_us_only_shipping memory). The customer's
// shipping address lives on Stripe Customer.shipping; subscriptions inherit
// from the customer for renewal invoices, so a single Customer-level write
// updates the destination of every active sub.
//
// "Multiple saved addresses" is explicitly deferred to v2 per plan §Q-4
// future considerations. This page handles the MVP case: one editable
// shipping address.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { customers, db } from "db";
import { stripe } from "lib/stripe";
import { getSession } from "lib/session";
import { AccountChrome } from "components/account/account-chrome";
import {
  AddressForm,
  type AddressFields,
} from "components/account/address-form";

export const metadata: Metadata = {
  title: "Addresses",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AddressesPage() {
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

  // Initial values come from Stripe Customer.shipping. Defaults are empty
  // strings if there's no shipping on file yet (e.g. customer who's never
  // checked out — rare since checkout is the primary onboarding path).
  let initial: AddressFields = {
    name: "",
    line1: "",
    line2: "",
    city: "",
    state: "",
    postalCode: "",
    phone: "",
  };

  if (customerRow?.stripeCustomerId) {
    try {
      const stripeCustomer = await stripe.customers.retrieve(
        customerRow.stripeCustomerId,
      );
      if (
        stripeCustomer &&
        !(stripeCustomer as Stripe.DeletedCustomer).deleted
      ) {
        const c = stripeCustomer as Stripe.Customer;
        const ship = c.shipping;
        const addr = ship?.address ?? c.address;
        if (addr) {
          initial = {
            name: ship?.name ?? c.name ?? "",
            line1: addr.line1 ?? "",
            line2: addr.line2 ?? "",
            city: addr.city ?? "",
            state: addr.state ?? "",
            postalCode: addr.postal_code ?? "",
            phone: ship?.phone ?? c.phone ?? "",
          };
        } else if (c.name) {
          initial.name = c.name;
        }
      }
    } catch (err) {
      console.error("[addresses] stripe customer retrieve failed", err);
    }
  }

  const hasStripeCustomer = Boolean(customerRow?.stripeCustomerId);

  return (
    <AccountChrome
      activeTab="addresses"
      eyebrow="Account · Addresses"
      title="Shipping"
      titleAccent="address."
      lede="Where your next box ships. We use this for delivery and for sales-tax calculation."
      containerWidth="narrow"
    >
      <div className="addr-wrap">
        {!hasStripeCustomer ? (
          <div className="addr-empty">
            <p>
              You haven&rsquo;t completed a checkout yet. Once you place your
              first order, your shipping address will live here.
            </p>
          </div>
        ) : (
          <AddressForm initial={initial} />
        )}
      </div>

      <style>{`
        .addr-wrap { padding-bottom: 80px; }
        .addr-empty {
          background: #fff;
          border: 1px solid rgba(26, 26, 26, 0.06);
          border-radius: 14px;
          padding: 32px;
          text-align: center;
        }
        .addr-empty p {
          font-size: 14px;
          color: var(--ink-soft);
          line-height: 1.55;
          margin: 0;
        }
      `}</style>
    </AccountChrome>
  );
}
