# Commerce Platform — Stripe ↔ Shopify ↔ Postgres ↔ Next.js

**Updated:** 2026-04-26 (W2 build)
**Status:** Code shipped, integration testing pending

---

## Architecture in one paragraph

Stripe is the source of truth for payments and subscription state. Shopify is the source of truth for product catalog, inventory, fulfillment, and orders. Postgres is a denormalized cache joining the two — recoverable from Stripe event history + Shopify order export. Next.js 15 (App Router, Node runtime for write paths) sits in front, serving the storefront and routing webhook traffic.

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Customer   │──1─▶ │  Next.js    │──2─▶ │   Stripe    │
│  (Browser)  │      │  /api/      │      │  Checkout   │
└─────────────┘      │  checkout   │      │  hosted     │
       │             └─────────────┘      └──────┬──────┘
       │                                          │ pays
       │                                          ▼
       │             ┌─────────────┐      ┌─────────────┐
       └────3────────│  Stripe     │◀─────│  webhooks   │
       redirect      │  Portal     │      │  (events)   │
                     └─────────────┘      └──────┬──────┘
                                                 │ POST
                                                 ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│  Postgres   │◀─────│  Next.js    │──5─▶ │  Shopify    │
│  (cache)    │  4   │  /api/      │      │  Admin API  │
└─────────────┘      │  webhooks/  │      │  (orders +  │
                     │  stripe     │      │  metafields)│
                     └─────────────┘      └─────────────┘
```

1. Customer clicks "Buy" or "Subscribe" — the frontend POSTs cart shape to `/api/checkout`
2. We create a Stripe Checkout Session, return its hosted URL, customer redirects to Stripe
3. Stripe handles card capture + tax + shipping + (for subs) recurring schedule. On any state change Stripe POSTs an event to `/api/webhooks/stripe`
4. Webhook handler verifies signature, deduplicates via `webhook_events` table, and dispatches to a per-event handler that mirrors state into Postgres
5. The handler then creates the corresponding Shopify order via Admin API with the Stripe charge ID written to the order's metafields, so support can reconcile

---

## Source-of-truth split

| Concern | Authority | Synced into |
|---|---|---|
| Card data, payment status | Stripe | (never leaves Stripe — PCI scope) |
| Subscription state (active / past_due / paused / canceled) | Stripe | Postgres `subscriptions` + Shopify customer metafield `subscription_status` |
| Recurring price + interval | Stripe Price (`price_...`) | Mirrored to Shopify variant metafield `stripe_price_id_subscription` |
| One-time price | Stripe Price (`price_...`) | Mirrored to Shopify variant metafield `stripe_price_id_onetime` |
| Product catalog (title, description, images, variants) | Shopify | Mirrored to Stripe Product metadata + name + description |
| Inventory levels | Shopify | (read by storefront via Storefront API; Stripe doesn't track) |
| Customer record (email, address, order history) | Shopify | Stripe customer record holds email + payment methods only |
| Orders (line items, fulfillment, shipping label) | Shopify | Created from Stripe webhook events |

If Postgres goes down, we can replay every Stripe event and re-write Shopify orders + metafields from a Shopify export. Nothing is only in our DB.

---

## Sequence: One-time purchase

```
Customer ──┬─▶ POST /api/checkout {line_items, success_url, cancel_url}
           │   {mode: 'payment'}
           │
           ◀── { url: 'https://checkout.stripe.com/...' }
           │
           ├─▶ Redirect to Stripe Checkout (hosted)
           │
           │   [Customer enters card, address, pays]
           │
           ◀── 302 to success_url
           │
Stripe ────┴─▶ POST /api/webhooks/stripe
                {type: 'checkout.session.completed', ...}

  Handler:
   1. Verify signature
   2. Insert webhook_events (stripe_event_id) — skip if duplicate
   3. Resolve charge_id via payment_intent.latest_charge
   4. Look up / create app-DB customer row by email
   5. Find / create Shopify customer
   6. createOrder(...) on Shopify Admin API with metafields:
        mujo_commerce.stripe_charge_id
        mujo_commerce.stripe_checkout_session_id
   7. Insert order_mirror row linking Stripe charge ↔ Shopify order
   8. Mark webhook_events.processed_at
   9. Return 200
```

Edge cases:
- **Stripe retries the same event** → idempotency table catches it on step 2; handler returns 200 immediately
- **Shopify Admin API down** → handler throws, idempotency row is rolled back, return 500, Stripe retries with exponential backoff up to 3 days
- **Customer already exists in Shopify** → `findOrCreateCustomer` returns the existing record; future orders attach to it

## Sequence: Subscription signup + first invoice

```
[customer signs up via Checkout (mode: subscription)]

Stripe fires events in approximate order:
  customer.created (we don't subscribe — ignored)
  customer.subscription.created (we don't subscribe — covered by .updated)
  invoice.paid (billing_reason: subscription_create)
  checkout.session.completed (mode: subscription)

  Handlers (any order — idempotent):
   - checkout.session.completed (subscription mode):
       upsertCustomerForStripe — links email ↔ stripe_customer_id ↔ shopify_customer_id
       (does NOT create order — defers to invoice.paid)
   - invoice.paid (billing_reason: subscription_create):
       upsert subscription row
       echo subscription_status = active to Shopify metafield
       create Shopify order tagged 'subscription-initial'
       order_mirror with type = subscription_initial
```

## Sequence: Subscription renewal

```
Stripe auto-charges the subscription on renewal day:
  invoice.paid (billing_reason: subscription_cycle)

  Handler:
   upsert subscription row (refresh current_period_*, status)
   create Shopify order tagged 'subscription-renewal'
   order_mirror with type = subscription_renewal
```

## Sequence: Failed renewal → past_due → cancellation

```
Renewal day, card declines:
  charge.failed (we log only)
  customer.subscription.updated (status → 'past_due')
       handler: upsert sub row, echo status to Shopify metafield

Stripe runs retry schedule (configurable in dashboard, default ~4 retries / 2 weeks):
  Each retry fires charge.succeeded or charge.failed
  If a retry succeeds → invoice.paid → renewal order created normally
  If all retries fail → customer.subscription.updated (status → 'canceled' or 'unpaid')
       handler: marks DB + Shopify metafield
       NO Shopify order created on failed charges
```

## Sequence: Customer self-serve (Stripe Billing Portal)

```
Customer ─┬─▶ "Manage my subscription" button
          │   ▼ modal
          │   email: customer@example.com
          │
          ├─▶ POST /api/billing-portal/request {email}
          │
          │   Server: rate-limit check (max 3/hour by email)
          │           lookup app-DB customers by email
          │           if found:
          │             generate JWT (15-min TTL, signed with MAGIC_LINK_SECRET)
          │             store sha256(token) in magic_link_tokens
          │             send email via Resend
          │           always return 200 (anti-enumeration)
          │
          ◀── { message: "Check your email" }
          │
          [Customer opens email, clicks button]
          │
          ├─▶ GET /api/billing-portal/redeem?token=...
          │
          │   Server: jwtVerify(token)
          │           magic_link_tokens row exists + not used + not expired
          │           mark used_at
          │           stripe.billingPortal.sessions.create({customer: stripeCustomerId})
          │
          ◀── 302 to https://billing.stripe.com/...
          │
          [Customer in Stripe-hosted portal: pause/cancel/skip/update card]
          │
          [Stripe fires customer.subscription.updated → our DB + metafields update]
```

---

## What can go wrong + how we recover

| Failure | Detection | Recovery |
|---|---|---|
| Stripe webhook signature invalid | Logged, return 400 | Verify `STRIPE_WEBHOOK_SECRET` matches the endpoint's signing secret in Stripe dashboard |
| Webhook handler crashes mid-flight | Returns 500, idempotency row deleted, Stripe retries | Logs in Vercel; if it keeps failing, replay from Stripe dashboard's "Failed events" view |
| Shopify Admin API rate limit hit | Order creation throws | Stripe retries with backoff; we may also batch with 500ms delay on subscription renewal spikes |
| DB connection drops | Webhook handler errors | Vercel auto-retries on next request; Stripe re-fires the event |
| Duplicate webhook delivery | webhook_events unique constraint | Returns 200 "already processed"; no duplicate order |
| Mirror script price drift | Stripe Price.unit_amount differs from Shopify variant.price | Script archives old Price, creates new, updates metafield |
| Shopify customer record missing | findOrCreateCustomer creates it | First order links to the new customer record |
| Postgres reset (test only) | Schema empty | Re-run drizzle-kit migrations; rebuild cache by replaying Stripe events + Shopify export |

---

## What this doc does NOT cover

- W3 surface — landing pages, Klaviyo client events, Meta Pixel, Okendo (separate plan)
- Production cutover — DNS, Vercel Pro upgrade, Stripe live-mode keys, theme unpublish (W3 plan)
- Lemna launch wiring — frozen until launch day, when /lemna page flips visible and CTA wires to `/api/checkout` with Lemna founding-member price ID

---

## See also

- `docs/webhooks.md` — Per-event handler reference
- `docs/metafields.md` — `mujo_commerce` namespace spec
- `docs/env-vars.md` — Full env-var inventory (W1 + W2 + W3)
- `docs/architecture.md` — One-page Shopify ↔ Stripe ↔ Postgres ↔ Next.js diagram (W1)
