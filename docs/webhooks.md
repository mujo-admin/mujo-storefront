# Stripe Webhooks — Event-by-Event Reference

**Endpoint:** `POST /api/webhooks/stripe`
**Runtime:** Node.js
**Auth:** Stripe signature header (`Stripe-Signature`) verified against `STRIPE_WEBHOOK_SECRET`
**Idempotency:** `webhook_events.stripe_event_id` (unique). On conflict → return 200 immediately.

---

## Subscribed events

Configured in Stripe Dashboard → Developers → Webhooks (Handoff #9):

| Event | Why we subscribe | Handler file |
|---|---|---|
| `checkout.session.completed` | Confirms a successful Checkout (one-time + sub initial); creates Shopify order for one-time | `lib/webhook-handlers/checkout-completed.ts` |
| `invoice.paid` | All paid subscription charges (initial + renewal + plan-change). Creates Shopify order. | `lib/webhook-handlers/invoice-paid.ts` |
| `customer.subscription.updated` | Status transitions (active ↔ past_due ↔ paused ↔ canceled), plan changes, period rolls. Mirrors state to DB + Shopify metafields. | `lib/webhook-handlers/subscription-updated.ts` |
| `customer.subscription.deleted` | Hard cancellation. Same handler as `.updated` (status forced to `canceled`). | `lib/webhook-handlers/subscription-updated.ts` |
| `charge.failed` | Logs failures (no DB writes — status transition rides on `customer.subscription.updated`) | `lib/webhook-handlers/charge-failed.ts` |
| `charge.refunded` | Logs refunds for reconciliation. No automatic Shopify edit. | `lib/webhook-handlers/charge-refunded.ts` |

Anything else → logged at INFO level in Vercel logs and returned 200 (Stripe doesn't retry).

---

## Receiver flow

```
1. Read raw body + Stripe-Signature header
2. stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
3. INSERT INTO webhook_events (stripe_event_id, type) ON CONFLICT DO NOTHING
4. If conflict (duplicate) → return 200 "already processed"
5. Switch on event.type → call handler
6. On handler success → UPDATE webhook_events SET processed_at = NOW() → return 200
7. On handler error → DELETE webhook_events row → return 500 → Stripe retries
```

The DELETE-on-error pattern means a partial/failed run never blocks the retry. Handlers must be internally idempotent (use `findOrCreate` patterns and DB unique constraints) to handle the case where step 4–5 succeeded but step 6 didn't run.

---

## Handler — `checkout.session.completed`

**Fires for:** Every successful Checkout (one-time payment OR subscription initial signup).

**One-time path (`mode: 'payment'`):**
1. Resolve customer email (priority: `customer_details.email` → `customer_email` → expanded customer)
2. `upsertCustomerForStripe` — find/create app-DB customer, find/create Shopify customer, link them, write `mujo_commerce.stripe_customer_id` Shopify metafield
3. Idempotency: skip if `order_mirror.stripe_checkout_session_id` already exists for this session
4. Resolve charge ID via `payment_intent.latest_charge` (expand if needed)
5. List session line items (call `stripe.checkout.sessions.listLineItems` — they're not always inflated)
6. `createOrder` on Shopify Admin API:
   - `tags: ['stripe-checkout', 'one-time']`
   - `financialStatus: 'PAID'`
   - Metafields: `stripe_charge_id`, `stripe_checkout_session_id`
   - Shipping address from `session.collected_information.shipping_details` (dahlia API path)
7. Insert `order_mirror` row with `type = 'one_time'`

**Subscription path (`mode: 'subscription'`):**
- Steps 1–2 same
- Order creation deferred to `invoice.paid` handler (which fires immediately after for the initial invoice). This keeps order-creation logic in one place.

---

## Handler — `invoice.paid`

**Fires for:** Every successful subscription charge — initial (`subscription_create`), renewal (`subscription_cycle`), or mid-cycle change (`subscription_update`).

1. Resolve subscription ID via `invoice.parent.subscription_details.subscription` (dahlia path; old `invoice.subscription` is gone)
2. `upsertCustomerForStripe`
3. Branch on `invoice.billing_reason`:
   - `subscription_create` → `OrderType = 'subscription_initial'`
   - `subscription_cycle` → `'subscription_renewal'`
   - `subscription_update` → `'subscription_update'`
   - else → log and exit (manual invoices, etc.)
4. Fetch the subscription via `stripe.subscriptions.retrieve` → extract period from `sub.items.data[0].current_period_start/end` (dahlia: period is per-item, not on the subscription itself)
5. Upsert subscription row in DB (current period, status, price ID, cancellation flags, paused state)
6. Echo to Shopify customer metafields: `subscription_status`, `current_period_end`
7. Resolve charge ID via `invoice.payments[].payment.payment_intent` → `payment_intent.latest_charge` (dahlia: invoices have a payments list, not a direct payment_intent)
8. Idempotency: skip if `order_mirror.stripe_charge_id` already exists
9. Build Shopify line items from `invoice.lines.data`
10. `createOrder` with appropriate tags + metafields
11. Insert `order_mirror` row

---

## Handler — `customer.subscription.updated` (and `.deleted`)

**Fires for:** Any subscription state change — cancellation, pause, plan change, status transition (active ↔ past_due ↔ unpaid).

1. Look up app-DB customer by `stripe_customer_id`
2. Extract period from items (dahlia)
3. Status:
   - For `.deleted` events → force `'canceled'`
   - For `.updated` → use `sub.status` directly
4. Upsert subscription row
5. Echo to Shopify metafields

**Does NOT create orders.** Order creation rides exclusively on `invoice.paid`.

---

## Handler — `charge.failed`

**Fires for:** Any failed charge — subscription renewal failure, one-time payment failure, retry failure.

Currently logs and exits. The status transition to `past_due` is handled by Stripe automatically firing `customer.subscription.updated` shortly after, so we let that handler do the DB write.

Future: emit Sentry/Slack alert from here for ops visibility.

---

## Handler — `charge.refunded`

**Fires for:** Any refund initiated in Stripe Dashboard or via API.

Logs the refund + cross-references to the Shopify order via `order_mirror`. Does NOT auto-edit the Shopify order — refunds should be paired with a manual Shopify-side refund / cancellation by Kinga to keep accounting clean.

Future: write a `refund_amount_cents` + `refunded_at` metafield onto the Shopify order so support can spot the linkage.

---

## Local testing — Stripe CLI

```bash
# Terminal 1
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# Outputs a local webhook secret — paste into .env.local STRIPE_WEBHOOK_SECRET while running

# Terminal 2
stripe trigger checkout.session.completed
stripe trigger invoice.paid
stripe trigger customer.subscription.updated
stripe trigger charge.failed
```

Watch logs in `pnpm dev`. Verify:
- DB row in `webhook_events` (status → `processed_at`)
- App-DB customer row in `customers`
- Shopify order created (admin → orders, look for tags + metafields)
- `order_mirror` row linking Stripe charge ↔ Shopify order

---

## Production endpoint configuration (Handoff #9)

In Stripe dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://mujo-storefront.vercel.app/api/webhooks/stripe` (staging) → swap to `https://mujoworld.com/api/webhooks/stripe` at W3 cutover
- Events: the six listed above
- Copy signing secret → set `STRIPE_WEBHOOK_SECRET` in Vercel env (Production scope)

Live and test mode use SEPARATE endpoints with SEPARATE signing secrets. Update the env var when promoting to live.
