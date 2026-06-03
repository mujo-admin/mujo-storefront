# Architecture

The Mujo Storefront is a **headless Next.js 15 app** on Vercel that fronts a stack of best-of-breed services. Shopify owns catalog + inventory + orders + fulfillment; Stripe owns checkout + subscriptions; Vercel Postgres owns subscription cache + magic-link state; Klaviyo + Meta + Loox own marketing instrumentation.

```
                  ┌────────────────────────┐
                  │  Customer (browser)    │
                  │  mujoworld.com         │
                  └──────────┬─────────────┘
                             │
                  ┌──────────▼─────────────┐
                  │  Next.js 15 + Vercel   │
                  │  (this repo)           │
                  └─┬────────┬───────┬─────┘
                    │        │       │
        ┌───────────┘        │       └────────────────┐
        │                    │                        │
┌───────▼──────────┐ ┌──────▼─────────┐  ┌────────────▼────────┐
│ Shopify          │ │ Stripe         │  │ Vercel Postgres     │
│  - Storefront API│ │  - Checkout    │  │  (Neon-backed)      │
│  - Admin API     │ │  - Billing     │  │  - subscriptions    │
│  - Webhooks      │ │  - Webhooks    │  │  - order_mirror     │
│                  │ │  - Customer    │  │  - webhook_events   │
│ catalog + orders │ │    Portal      │  │  - magic_links      │
└──────────────────┘ └────────────────┘  └─────────────────────┘
        │                    │
        └─────── join ───────┘
       Stripe product/price IDs
       stored as Shopify metafields
       (mujo_commerce.* namespace)
```

## Source-of-truth ownership

| Concern | Owner | Notes |
|---|---|---|
| Product catalog (titles, descriptions, images, variants) | Shopify | Headless Storefront API reads |
| Inventory levels | Shopify | Reflected in Storefront API responses |
| Prices (display) | Shopify | Mirrored to Stripe — display anywhere reads from Shopify |
| Prices (charge) | Stripe | Stripe is what actually charges — if Shopify and Stripe drift, fix Stripe-side and re-mirror to Shopify |
| Orders | Shopify | Created by webhook handlers via Admin API after Stripe checkout succeeds |
| Fulfillment | Shopify | Standard ShipStation / 3PL flow |
| Customer records | Shopify | Stripe customers linked back via `mujo_commerce.stripe_customer_id` metafield |
| Subscriptions (state) | Stripe | Cache in Vercel Postgres for fast lookups |
| Subscriptions (UX) | Stripe Billing Portal | Customer self-service via magic-link |
| Payment methods | Stripe | Never touches our infra |
| Email — transactional | Resend | Magic-links, migration, etc. |
| Email — marketing | Klaviyo | Welcome flows, abandoned cart, post-purchase |
| Reviews | Loox | Headless widget (feed + star badge) rendered on PDPs |
| Pixel + attribution | Meta + Klaviyo | Client + server-side events with deduplication |

## The metafield join

Shopify and Stripe stay in sync via Shopify metafields under the `mujo_commerce` namespace:

| Metafield | Owner | Type | Purpose |
|---|---|---|---|
| `mujo_commerce.stripe_product_id` | Product | text | One per product, mirrors Stripe product |
| `mujo_commerce.stripe_price_id_onetime` | Product variant | text | One-time charge price |
| `mujo_commerce.stripe_price_id_subscription` | Product variant | text | Recurring price (if subscribable) |
| `mujo_commerce.is_subscribable` | Product | boolean | Frontend gate for "subscribe" toggle |
| `mujo_commerce.subscription_status` | Customer | text | Echoed from Stripe — visible in Shopify admin |
| `mujo_commerce.current_period_end` | Customer | date | Next renewal date — support visibility |
| `mujo_commerce.stripe_customer_id` | Customer | text | Linkage |

Populated by `scripts/mirror-shopify-to-stripe.ts` (W2). Re-runnable.

## Data flows

### Catalog read (W1, working)

`Browser → Next.js → Shopify Storefront API → response → SSR rendered HTML`. Cached per-page via Next.js ISR; revalidated when Shopify webhooks hit `/api/revalidate` (W2 sets these up).

### One-time purchase (W2)

```
Browser  ─click "Buy"→  /api/checkout  ──→  Stripe Checkout Session
                                                │
Browser  ←redirect────  Stripe-hosted UI  ←────┘
                                                │
                          ─pays test card→      │
                                                │
   ┌──── checkout.session.completed webhook ────┘
   │
   ▼
/api/webhooks/stripe  ──→  Postgres (order_mirror)
                       ──→  Shopify Admin API → create order
                       ──→  Customer metafields updated
```

### Subscription signup + renewal (W2)

Same as one-time, but `mode: subscription`. Initial charge fires `invoice.paid` (`subscription_create` reason) → Shopify order tagged `subscription-initial`. Each monthly renewal fires another `invoice.paid` (`subscription_cycle` reason) → Shopify order tagged `subscription-renewal`. Stripe is the schedule clock.

### Magic-link Billing Portal (W2)

```
Browser → /api/billing-portal/request ──→ Resend → email customer
                                                     │
                                                     ▼
Customer clicks link →  /api/billing-portal/redeem  → Stripe Billing Portal Session
                                                      │
                                              redirect to Stripe-hosted portal
```

JWT token TTL: 15 min. Stored as SHA-256 hash in `magic_link_tokens` table.

## Why this stack

- **Next.js 15 on Vercel** — best-in-class React framework, edge-cached SSR, native Postgres integration, $0 dev cost.
- **Shopify (headless)** — keeps inventory + fulfillment + Shopify Markets + tax-table goodies, lets us swap the customer-facing UX entirely.
- **Stripe (full commerce)** — Shopify checkout has no extensibility for our subscription needs; Stripe Billing + Checkout + Customer Portal handle it natively. Stripe Tax, one-click Apple Pay / Google Pay / Link / Afterpay / Affirm out of the box.
- **Vercel Postgres / Neon** — zero-friction provisioning, free tier covers Mujo through 5K-10K subs, replayable from Stripe event history (DB is a cache, not source of truth).
- **Resend** — React Email integration, good free tier, simple domain verification.

## What this is NOT

- **Not Hydrogen.** Shopify's React framework on Oxygen is less battle-tested for our integrations.
- **Not Loop / Skio / Recharge.** Stripe handles subscriptions natively, ~$100/mo saved vs Shopify subscription apps.
- **Not Shop Pay.** Consciously traded out at 2026-04-22 — Stripe Link + Apple/Google Pay + Afterpay + Affirm cover the same intent. See `project_stripe_checkout_locked.md` memory.
- **Not multi-tenant.** Single store (Mujo Co.), single Stripe account. If we ever add a second brand, we'd fork the architecture.

## Per-week scope

- **W1** (this commit): Vercel + Next.js + Shopify Storefront reads + Postgres provisioned (empty schema)
- **W2** (next): Shopify Admin API, Stripe products mirror, DB schema, webhook handlers, magic-link portal, existing-subscriber migration
- **W3** (next next): Mujo Ritual v4 HTML port, Lemna early-access page, Klaviyo + Meta + Okendo wiring, DNS cutover from Liquid theme

See `plans/2026-04-21-headless-w*.md` in the AIOS workspace for full per-phase plans.
