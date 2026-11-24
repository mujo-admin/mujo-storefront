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

1. Customer clicks "Buy" or "Subscribe" — the frontend POSTs cart shape to `/api/checkout-session` (the older hosted `/api/checkout` route was removed 2026-11-23)
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

## Discounts & promo codes

Stripe Checkout has **one discount slot per session**: you can pass a coupon in `discounts[]` **or** enable the customer-typed promo box with `allow_promotion_codes: true`, never both, and the box itself accepts a single code. We split the two kinds of discount so the slot stays free for marketing:

- **Standing subscriber discount (15%) → baked into the subscription Price.** The mirror script (`scripts/mirror-shopify-to-stripe.ts`, `SUBSCRIBER_DISCOUNT = 0.15`) creates the subscription Prices at retail × 0.85 (`$65 → $55.25`). No coupon is applied at checkout, so the cart total and Stripe agree with no discount line. `SUBSCRIBER_DISCOUNT_PERCENT = 15` in `lib/stripe-constants.ts` is the single source of truth for the account "% off retail" label.
- **Promotions (first-purchase, partner, press) → promotion codes in the box.** Both checkout routes set `allow_promotion_codes: true` on **every** cart (one-time and subscription), so a subscribing shopper can redeem `WELCOME10` etc. on top of the already-discounted subscription Price. **Every promo coupon must be `duration: once`** — otherwise a percentage promo would discount every subscription renewal, not just the first invoice.
- **Legacy / migrated subscribers → keep the `MUJO_SUB_15` coupon.** Subscriptions created before this change (and the not-yet-run Loop migration) sit on the old full-retail Price + coupon, which nets the same `$55.25`. The account `discountPercent` reads `coupon.percent_off` when present, else falls back to `SUBSCRIBER_DISCOUNT_PERCENT`, so both show "15% off retail". Account swap/gift flows charge the subscription Price's `unit_amount` directly (it is already the member rate) — never re-applying the 15%.

---

## Sequence: One-time purchase

```
Customer ──┬─▶ POST /api/checkout-session {items, origin}
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

## Shopify orders are complete copies (2026-10)

A mirrored Shopify order now carries everything Stripe charged: the payment itself, shipping, sales tax, any promo code, and per-unit prices. Shopify shows **Paid** with nothing outstanding and its total equals the Stripe charge. Refunds issued in Stripe are mirrored as Shopify refunds (no restock, no customer email). Orders created before this shipped were not backfilled. Field-by-field detail, the two order tags (`needs-reconciliation`, `stripe-refunded`) and the proof scripts are in [webhooks.md](webhooks.md).

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

## Checkout and webhook safeguards (2026-11-23)

- **Only sellable Prices.** `/api/checkout-session` rejects any Price ID that is not in `isSellablePriceId()` (`lib/stripe-constants.ts`: Ritual, Protein Powder and merch Prices). A new product's Prices must be added to one of those maps or checkout answers `price_not_for_sale`. The $0 frother gift Price is never accepted from the browser; only the server adds it.
- **Existing customers are attached only for signed-in shoppers.** A guest request is never matched to a Stripe Customer by email (the email is unverified and Checkout would overwrite that customer's saved shipping address). Guests always get a new Customer.
- **Unfinished webhook events are retried.** `webhook_events` rows with `processed_at` empty are attempts that were killed part-way. A retry within 2 minutes gets `409` (Stripe retries later); after that the retry takes the event over. Only a row with `processed_at` set answers "already processed". The route's `maxDuration` is 60 seconds.
- **No second Shopify order on a retry.** Before creating an order, `createMirroredOrder()` asks Shopify whether the customer already has an order with this charge id (`findOrderByStripeChargeId`, metafield `mujo_commerce.stripe_charge_id`) and reuses it.

## Public endpoints (2026-11-23, security batch 2)

- **`/api/klaviyo/subscribe`** accepts only the lists the site's signup forms use (`rebel_club`, `lemna_waitlist`), the one property they send (`mujo_tribe`) and a known source label. Free-form profile properties are dropped.
- **`/api/meta/convert`** accepts only `ViewContent`, `AddToCart` and `Lead` with a fixed set of fields. `Purchase` and `InitiateCheckout` are sent by the server only and are refused here.
- **`/api/klaviyo/track`** accepts only "Order Confirmation Viewed", and only after Stripe confirms that checkout was completed by that email; the amount comes from Stripe.
- **`/api/contact`** is what the `/contact` form posts to; messages go to hello@mujoworld.com (wired in `imported-page-runtime.tsx`; before this the form was inert). The sender joins the email list only when they tick the box (`marketingConsent: true`). A filled hidden `company` field (bots) is answered `ok` and dropped.
- **Cookie bar "No thanks"** stops Meta as well as GA4 and Klaviyo: no browser pixel event, no `/api/meta/convert` mirror, and (through `tracking_declined` on the Stripe session and subscription metadata) no server-sent `InitiateCheckout` or `Purchase`.
- Flood protection for these endpoints is a set of Vercel Firewall rate-limit rules, not code.

## Orders and subscriptions (2026-11-23, security batch 3a)

- **Two-delivery minimum (lib/subscription-minimum.ts).** Cancel is always accepted online. Under two orders in `order_mirror`, the cancellation is saved on the Stripe subscription (`metadata.cancel_after_minimum = 1`, plus the reason) and the `invoice.paid` handler sets `cancel_at_period_end` once the second order is recorded, so there is no third charge; `resume` withdraws it. Pause and skip answer `409 minimum_not_met` until the second order. Subscribers on legacy Prices or moved from Loop are never under the minimum. Decided 2026-11-23 after the state auto-renewal law review (AIOS `outputs/legal-and-compliance/subscription-minimum-2026-11/`): a cancel button that refuses online is the riskiest design.
- **Gifts charge sales tax.** `send-gift` asks Stripe Tax for the tax on the recipient's address (`stripe.tax.calculations`), charges price + tax, and carries the tax lines on the PaymentIntent metadata (`gift_taxes`, `tax_calculation`) so the Shopify order matches; the `payment_intent.succeeded` handler records the tax transaction for Stripe Tax reporting. An address Stripe Tax cannot place is refused.
- **Gifts are charged once.** The same gift (product, recipient, address, note) within 10 minutes returns the first payment; Stripe's idempotency key covers simultaneous requests. At most 3 gifts per account per day.
- **A refunded duplicate never becomes an order.** `invoice.paid` skips a charge that is already fully refunded; `charge.refunded` for a charge under 10 minutes old with no order yet throws so Stripe retries.
- **Fully discounted orders ship.** A checkout or invoice made free by a discount (total 0, subtotal above 0) is mirrored with the key `free_<session or invoice id>` and no payment transaction. A $0 invoice with nothing on it (skip, cadence change) is still not an order.
- **A guest purchase no longer re-links a subscriber.** `upsertCustomerForStripe` keeps the account's `stripe_customer_id` when the account has a live subscription; emails are stored in lower case and matched case-insensitively. `subscription-updated` finds the account through the recorded subscription when the Stripe Customer is not the linked one.
- **The duplicate-subscription guard looks across Stripe Customers with the same email**, because every guest checkout makes a new Customer.
- A card update reports failure if a subscription could not be switched to the new card. The billing portal returns to `/account`.

## Login and site hardening (2026-11-23, security batch 3b)

- **Login links last 30 minutes** (were 7 days) and are single-use by one atomic database statement.
- **Logout is real.** `customers.sessions_valid_after` (migration `0002`) is set on logout and on an email change; `getSession()` and login-link redeem refuse anything issued before it (`sessionStillValid`, `revokeSessions` in `lib/session.ts`). Logging out ends every session on every device.
- **No hints about who is a customer.** A rate-limited login or billing-portal request gets the same 200 as any other; an email change to an address another account owns answers `ok` and sends nothing. Per-IP flood limits are Vercel Firewall rules.
- **Email change notifies the current address** as well as asking the new one to confirm.
- **Emails are matched case-insensitively** on login, billing portal and email change.
- **Security headers on every response** (`next.config.ts`): `frame-ancestors 'self'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`. A full Content-Security-Policy is a later, report-only-first step.
- **`/api/healthcheck`** no longer returns raw error text. **Account routes** return a plain message for non-card Stripe errors (`lib/public-error.ts`).
- JSON-LD escapes `<`; `/journal/page/[n]` 404s for unknown pages; Klaviyo logs mask emails; the Shopify customer lookup is quoted and must match exactly.

## Leftovers from the security review (2026-11-24)

- **"Send my next box now" charges one full box and restarts the cycle from today.** Ending a trial is the Stripe update that bills a full period on the spot, so `send-now` puts an active subscription on a trial that ends on its existing renewal date (no charge), then ends the trial now with `payment_behavior: error_if_incomplete`. A declined card refuses the request and the next box still goes out on the original date. Do not use `billing_cycle_anchor: "now"` for this: with prorations it billed nothing and left a stray item on the next renewal, without prorations it opened a new period that was never invoiced (sandbox, 2026-11-24). The paid invoice (`billing_reason: subscription_update`) becomes a Shopify order like a renewal and counts as a delivery. A second request within 10 minutes of the last charge answers `409 already_sent`; a paused subscription answers `409 subscription_paused`.
- **Gift recipients are not added to Klaviyo.** They never asked to hear from Mujo. The recipient email stays on the PaymentIntent metadata (`gift_recipient_email`). `KLAVIYO_GIFT_RECIPIENT_LIST_ID` is no longer read.
- **Ambassador applications are emailed to hello@mujoworld.com** (were kinga@), the same inbox as the contact form.


- **Content-Security-Policy, watch-only (2026-11-24).** `next.config.ts` sends `Content-Security-Policy-Report-Only` on every response (`CSP_SOURCES`: the hosts scripts, styles, fonts, frames and connections may come from). Nothing is blocked. Browsers report what would be blocked to `/api/csp-report`, which writes one line to the server log (`[csp-report] <directive> blocked=<origin> page=<path>`, query strings dropped, browser-extension noise dropped, nothing stored). No nonces, so prerendering and the CDN cache are untouched; the cost is `'unsafe-inline'`. Google Analytics also pings a country Google domain (`www.google.<tld>`), which shows as a report for visitors outside the US and is harmless. A new outside service must be added to `CSP_SOURCES`. Next step: read a week or two of reports, add what is missing, then move the same value to the enforcing `Content-Security-Policy` header.
