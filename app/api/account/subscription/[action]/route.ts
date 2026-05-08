// POST /api/account/subscription/{action}
//
// action ∈ {pause, skip-next, cancel, resume, send-now, swap}.
//
// All actions update the live Stripe Subscription server-side, then mirror
// the result into our `subscriptions` table inline so the next page render
// reflects the new state immediately (without waiting for the
// `customer.subscription.updated` webhook to land). The webhook still fires
// asynchronously and idempotently rewrites the same state.
//
// Customer Portal blocks pause + subscription_update for our account per
// project_stripe_tax_and_portal.md memory; the underlying API path used here
// is unaffected.

import type { NextRequest } from "next/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import Stripe from "stripe";
import { z } from "zod";
import { db, subscriptions } from "db";
import { stripe } from "lib/stripe";
import {
  getSubscriptionCycleSeconds,
  syncSubscriptionToDb,
} from "lib/webhook-handlers/_helpers";
import { getSession, refreshSession } from "lib/session";
import { RITUAL_PRICE_IDS } from "lib/stripe-constants";

export const dynamic = "force-dynamic";

const ACTIONS = [
  "pause",
  "skip-next",
  "cancel",
  "resume",
  "send-now",
  "swap",
] as const;
type Action = (typeof ACTIONS)[number];

const ACTIVE_SUB_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "paused",
] as const;

const pauseSchema = z.object({
  cycles: z.number().int().min(1).max(3).default(1),
});

const cancelSchema = z.object({
  reason: z.string().min(1).max(64),
  comment: z.string().max(500).optional(),
});

const swapSchema = z.object({
  /** Target Stripe Price ID. Must be in RITUAL_PRICE_IDS. */
  priceId: z.string().startsWith("price_"),
});

const STRIPE_FEEDBACK_MAP: Record<
  string,
  Stripe.SubscriptionUpdateParams.CancellationDetails.Feedback
> = {
  too_expensive: "too_expensive",
  missing_features: "missing_features",
  low_quality: "low_quality",
  switched_service: "switched_service",
  unused: "unused",
  customer_service: "customer_service",
  too_complex: "too_complex",
  other: "other",
};

const ALLOWED_RITUAL_PRICE_IDS: Set<string> = new Set(
  Object.values(RITUAL_PRICE_IDS).filter((id) => id.length > 0),
);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ action: string }> },
) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { action: actionRaw } = await ctx.params;
  if (!(ACTIONS as readonly string[]).includes(actionRaw)) {
    return Response.json({ error: "unknown_action" }, { status: 404 });
  }
  const action = actionRaw as Action;

  const rows = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.customerId, session.customerId),
        inArray(subscriptions.status, [...ACTIVE_SUB_STATUSES]),
      ),
    )
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);

  const subRow = rows[0];
  if (!subRow) {
    return Response.json({ error: "no_active_subscription" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    if (req.headers.get("content-length") !== "0") {
      body = await req.json();
    }
  } catch {
    body = {};
  }

  try {
    let updatedSub: Stripe.Subscription;

    if (action === "pause") {
      const parsed = pauseSchema.parse(body);
      // Read current sub to derive the canonical cycle length from
      // price.recurring (NOT the period delta — that compounds across
      // successive pauses and produces 245-day cycles).
      const current = await stripe.subscriptions.retrieve(
        subRow.stripeSubscriptionId,
        { expand: ["items.data.price"] },
      );
      const cycleSeconds = getSubscriptionCycleSeconds(current);
      const resumesAt = Math.floor(Date.now() / 1000) + parsed.cycles * cycleSeconds;
      updatedSub = await stripe.subscriptions.update(
        subRow.stripeSubscriptionId,
        {
          pause_collection: {
            behavior: "mark_uncollectible",
            resumes_at: resumesAt,
          },
        },
      );
    } else if (action === "skip-next") {
      // Extend current period by exactly one canonical cycle. Setting
      // `trial_end` on an active subscription with `proration_behavior: 'none'`
      // shifts the next billing date out with no charge.
      const current = await stripe.subscriptions.retrieve(
        subRow.stripeSubscriptionId,
        { expand: ["items.data.price"] },
      );
      const cycleSeconds = getSubscriptionCycleSeconds(current);
      const newPeriodEnd =
        Math.floor(subRow.currentPeriodEnd.getTime() / 1000) + cycleSeconds;
      updatedSub = await stripe.subscriptions.update(
        subRow.stripeSubscriptionId,
        {
          trial_end: newPeriodEnd,
          proration_behavior: "none",
        },
      );
    } else if (action === "cancel") {
      const parsed = cancelSchema.parse(body);
      const feedback = STRIPE_FEEDBACK_MAP[parsed.reason] ?? "other";
      updatedSub = await stripe.subscriptions.update(
        subRow.stripeSubscriptionId,
        {
          cancel_at_period_end: true,
          cancellation_details: {
            feedback,
            comment: parsed.comment,
          },
        },
      );
    } else if (action === "resume") {
      // Clear pause_collection AND cancel_at_period_end in one call. Stripe
      // ignores no-op fields, so this works whether sub was paused, canceling,
      // or both.
      updatedSub = await stripe.subscriptions.update(
        subRow.stripeSubscriptionId,
        {
          pause_collection: "",
          cancel_at_period_end: false,
        },
      );
    } else if (action === "send-now") {
      // Advance billing — bills immediately and resets the cycle anchor to now.
      // Used both as a customer-facing "Send my next box now" action AND as
      // recovery from over-pausing during testing.
      updatedSub = await stripe.subscriptions.update(
        subRow.stripeSubscriptionId,
        {
          billing_cycle_anchor: "now",
          proration_behavior: "create_prorations",
        },
      );
    } else {
      // action === "swap"
      const parsed = swapSchema.parse(body);
      if (!ALLOWED_RITUAL_PRICE_IDS.has(parsed.priceId)) {
        return Response.json(
          { error: "invalid_price", message: "That product isn't available." },
          { status: 400 },
        );
      }
      // Update the first sub item's price. Stripe rebuilds the line items
      // automatically. Use 'create_prorations' so the customer's next charge
      // reflects the price change.
      const current = await stripe.subscriptions.retrieve(
        subRow.stripeSubscriptionId,
      );
      const itemId = current.items.data[0]?.id;
      if (!itemId) {
        return Response.json(
          { error: "no_subscription_item" },
          { status: 502 },
        );
      }
      updatedSub = await stripe.subscriptions.update(
        subRow.stripeSubscriptionId,
        {
          items: [{ id: itemId, price: parsed.priceId }],
          proration_behavior: "create_prorations",
        },
      );
    }

    // Mirror the updated state to our DB inline. The webhook will fire later
    // and idempotently rewrite the same state.
    await syncSubscriptionToDb(updatedSub);

    await refreshSession();
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return Response.json(
        { error: "invalid_body", details: err.issues },
        { status: 400 },
      );
    }
    if (err instanceof Stripe.errors.StripeError) {
      console.error(`[subscription/${action}] Stripe error`, {
        code: err.code,
        message: err.message,
      });
      return Response.json(
        { error: err.code ?? "stripe_error", message: err.message },
        { status: err.statusCode ?? 502 },
      );
    }
    console.error(`[subscription/${action}] unexpected error`, err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
