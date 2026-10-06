// Handler: checkout.session.expired
//
// A checkout session expires an hour after it was opened if nobody paid. When
// Stripe can tell us who it was, this sends Klaviyo a "Checkout Abandoned"
// event with the cart and a link that rebuilds it, which is what the abandoned
// checkout email is triggered by.
//
// An email is only used when one of these is true:
//   - the shopper ticked Stripe's "email me news and offers" box, or
//   - they are an existing customer (the session was opened for a known
//     Stripe customer), which makes the reminder a customer message.
// Nobody is ever added to a list here.

import type Stripe from "stripe";
import { stripe } from "lib/stripe";
import {
  itemsFromPriceIds,
  itemsValue,
  SITE_ORIGIN,
} from "lib/analytics-server";
import { trackCheckoutAbandoned } from "lib/klaviyo";

/** How far back a paid checkout cancels the reminder. */
const RECENT_PURCHASE_WINDOW_SECONDS = 6 * 60 * 60;

export async function handleCheckoutExpired(event: Stripe.Event) {
  if (event.type !== "checkout.session.expired") return;
  const session = event.data.object;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  let email = session.customer_details?.email ?? session.customer_email ?? null;
  if (!email && customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (!customer.deleted) email = customer.email ?? null;
    } catch (err) {
      console.error("[checkout.expired] customer lookup failed", {
        customerId,
        err,
      });
    }
  }
  if (!email) {
    console.log("[checkout.expired] no email on session, nothing to send", {
      sessionId: session.id,
    });
    return;
  }

  const optedIn = session.consent?.promotions === "opt_in";
  if (!optedIn && !customerId) {
    console.log("[checkout.expired] no consent and not a customer, skipping", {
      sessionId: session.id,
    });
    return;
  }

  // The checkout page replaces its session when the cart changes, so an expired
  // session often belongs to someone who then paid on a newer one. Never remind
  // a person who has just bought.
  try {
    const recent = await stripe.checkout.sessions.list({
      customer_details: { email },
      status: "complete",
      created: { gte: session.created - RECENT_PURCHASE_WINDOW_SECONDS },
      limit: 1,
    });
    if (recent.data.length > 0) {
      console.log(
        "[checkout.expired] shopper completed another checkout, skipping",
        {
          sessionId: session.id,
        },
      );
      return;
    }
  } catch (err) {
    // If we cannot tell, do not send: a reminder to a buyer is worse than none.
    console.error(
      "[checkout.expired] recent purchase check failed, skipping",
      err,
    );
    return;
  }

  const lines = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 100,
  });
  const items = itemsFromPriceIds(
    lines.data.map((li) => ({
      priceId: li.price?.id ?? "",
      quantity: li.quantity ?? 1,
      amountCents: li.amount_subtotal,
    })),
  );
  if (items.length === 0) return;

  const restore = session.metadata?.restore;
  await trackCheckoutAbandoned({
    email,
    value: itemsValue(items),
    items,
    checkoutUrl: restore ? `${SITE_ORIGIN}${restore}` : `${SITE_ORIGIN}/shop`,
    sessionId: session.id,
  });

  console.log("[checkout.expired] Checkout Abandoned sent", {
    sessionId: session.id,
    optedIn,
    existingCustomer: Boolean(customerId),
  });
}
