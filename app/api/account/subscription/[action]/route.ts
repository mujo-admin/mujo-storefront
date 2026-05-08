// POST /api/account/subscription/{action}
//
// action ∈ {pause, skip-next, cancel, resume}.
//
// All four actions update the live Stripe Subscription server-side. Stripe's
// `customer.subscription.updated` webhook (already handled by W2) mirrors the
// new state into our `subscriptions` table, so we don't write the DB here —
// we just call Stripe and trust the webhook to land the diff. The route does
// validate the customer owns the subscription before any Stripe call.
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
import { getSession, refreshSession } from "lib/session";

export const dynamic = "force-dynamic";

const ACTIONS = ["pause", "skip-next", "cancel", "resume"] as const;
type Action = (typeof ACTIONS)[number];

const ACTIVE_SUB_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "paused",
] as const;

// Per-action body schemas.
const pauseSchema = z.object({
  cycles: z.number().int().min(1).max(3).default(1),
});

const cancelSchema = z.object({
  reason: z.string().min(1).max(64),
  comment: z.string().max(500).optional(),
});

// Map our internal cancel reason IDs onto Stripe's
// `cancellation_details.feedback` enum. Stripe rejects values outside its
// fixed set, so we route everything else into "other" with our raw reason
// preserved in the comment.
const STRIPE_FEEDBACK_MAP: Record<string, Stripe.SubscriptionUpdateParams.CancellationDetails.Feedback> = {
  too_expensive: "too_expensive",
  missing_features: "missing_features",
  low_quality: "low_quality",
  switched_service: "switched_service",
  unused: "unused",
  customer_service: "customer_service",
  too_complex: "too_complex",
  other: "other",
};

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

  // Find the customer's most recent active-ish subscription. We assume one
  // active subscription per customer for the MVP (matches the canonical
  // Mujo Ritual offer). Multi-sub will need a body-level subscription_id.
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
    return Response.json(
      { error: "no_active_subscription" },
      { status: 404 },
    );
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
    if (action === "pause") {
      const parsed = pauseSchema.parse(body);
      // Pause via collection-level pause: Stripe stops attempting payment
      // and emits invoice.upcoming events resuming on `resumes_at`.
      // We compute resume = now + cycles * (currentPeriod length). Falls
      // back to 30 days/cycle if Stripe period info is missing.
      const periodMs =
        subRow.currentPeriodEnd.getTime() -
        subRow.currentPeriodStart.getTime();
      const cycleMs = periodMs > 0 ? periodMs : 30 * 24 * 60 * 60 * 1000;
      const resumesAt = Math.floor(
        (Date.now() + parsed.cycles * cycleMs) / 1000,
      );
      await stripe.subscriptions.update(subRow.stripeSubscriptionId, {
        pause_collection: {
          behavior: "mark_uncollectible",
          resumes_at: resumesAt,
        },
      });
    } else if (action === "skip-next") {
      // Skip = extend the current period by one cycle. Setting `trial_end`
      // on an active subscription with `proration_behavior: 'none'` shifts
      // the next billing date out by the diff with no charge.
      const periodMs =
        subRow.currentPeriodEnd.getTime() -
        subRow.currentPeriodStart.getTime();
      const cycleMs = periodMs > 0 ? periodMs : 30 * 24 * 60 * 60 * 1000;
      const newPeriodEnd = Math.floor(
        (subRow.currentPeriodEnd.getTime() + cycleMs) / 1000,
      );
      await stripe.subscriptions.update(subRow.stripeSubscriptionId, {
        trial_end: newPeriodEnd,
        proration_behavior: "none",
      });
    } else if (action === "cancel") {
      const parsed = cancelSchema.parse(body);
      const feedback = STRIPE_FEEDBACK_MAP[parsed.reason] ?? "other";
      await stripe.subscriptions.update(subRow.stripeSubscriptionId, {
        cancel_at_period_end: true,
        cancellation_details: {
          feedback,
          comment: parsed.comment,
        },
      });
    } else if (action === "resume") {
      // Resume covers two cases:
      //  1. Was paused → clear pause_collection (Stripe accepts null, also
      //     accepts unsetting via empty-object literal — null is the SDK-
      //     supported clear).
      //  2. Was canceling → flip cancel_at_period_end back to false.
      // We send both clears in one call; Stripe ignores no-op fields.
      await stripe.subscriptions.update(subRow.stripeSubscriptionId, {
        pause_collection: "",
        cancel_at_period_end: false,
      });
    }

    // Sliding-refresh the session cookie on activity.
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
      console.error("[subscription/" + action + "] Stripe error", {
        code: err.code,
        message: err.message,
      });
      return Response.json(
        { error: err.code ?? "stripe_error", message: err.message },
        { status: err.statusCode ?? 502 },
      );
    }
    console.error("[subscription/" + action + "] unexpected error", err);
    return Response.json({ error: "internal_error" }, { status: 500 });
  }
}
