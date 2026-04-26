# `mujo_commerce` Metafield Namespace

**Purpose:** Every cross-system identifier and Stripe-derived state we write back to Shopify lives under this namespace. Keeping one namespace makes audits, exports, and cleanup trivial.

**Owner:** Mujo Storefront (W2). Both the mirror script and the webhook handlers write here. The frontend reads product/variant metafields via the Storefront API for rendering pricing CTAs.

---

## Schema

### Product-level

| Key | Type | Set by | Read by | Purpose |
|---|---|---|---|---|
| `stripe_product_id` | `single_line_text_field` | `mirror-shopify-to-stripe.ts` | Storefront (informational) | One Stripe Product per Shopify Product (`prod_XXX`) |
| `is_subscribable` | `boolean` | Kinga (manual, in Shopify admin) | Mirror script + storefront | Gates whether a recurring Stripe Price is created + whether the frontend renders the subscribe toggle |

### Variant-level

| Key | Type | Set by | Read by | Purpose |
|---|---|---|---|---|
| `stripe_price_id_onetime` | `single_line_text_field` | Mirror script | Storefront → checkout | One-time Stripe Price (`price_XXX`); referenced by `/api/checkout` |
| `stripe_price_id_subscription` | `single_line_text_field` | Mirror script | Storefront → checkout | Recurring Stripe Price; only present when `is_subscribable: true` on the parent product |

### Customer-level

| Key | Type | Set by | Read by | Purpose |
|---|---|---|---|---|
| `stripe_customer_id` | `single_line_text_field` | Webhooks (`upsertCustomerForStripe`) | Support (Shopify admin) | Linkage to the Stripe customer record (`cus_XXX`) — lets Kinga jump from a Shopify customer to their Stripe view in 1 click |
| `subscription_status` | `single_line_text_field` | Webhooks (`echoSubscriptionStatusToShopify`) | Support (Shopify admin) | Echo of Stripe subscription status: `active` / `past_due` / `paused` / `canceled` / `unpaid` / `trialing` / `incomplete` / `incomplete_expired` |
| `current_period_end` | `date` | Webhooks | Support (Shopify admin) | YYYY-MM-DD of next renewal (or end-of-cancellation-period) |

### Order-level

| Key | Type | Set by | Read by | Purpose |
|---|---|---|---|---|
| `stripe_charge_id` | `single_line_text_field` | Webhooks (`createOrder`) | Support, finance reconciliation | Stripe Charge that paid for this order (`ch_XXX`) |
| `stripe_checkout_session_id` | `single_line_text_field` | Webhooks (one-time orders) | Audit | The Checkout Session that produced this order (`cs_XXX`) |
| `stripe_invoice_id` | `single_line_text_field` | Webhooks (subscription orders) | Audit | The Invoice the renewal came from (`in_XXX`) |
| `stripe_subscription_id` | `single_line_text_field` | Webhooks (subscription orders) | Audit, support | Parent subscription (`sub_XXX`) |
| `billing_reason` | `single_line_text_field` | Webhooks (subscription orders) | Audit | `subscription_create` / `subscription_cycle` / `subscription_update` |

---

## Why a single namespace

Without a namespace convention, future-Kinga (or future-Claude) ends up guessing which metafield came from where. With `mujo_commerce.*`:

- All cross-system IDs are findable via Shopify GraphQL `metafields(namespace: "mujo_commerce")`
- Schema lives in one place (this doc + `lib/metafields.ts`)
- A future migration / cleanup can target the namespace in one query
- Other apps writing to Shopify (Klaviyo, Loop, Skio, Okendo) own their own namespaces and never collide

## Why not custom resources / metaobjects

For W2's needs (id linkage + status echo), simple string + boolean + date metafields are sufficient. Metaobjects add a definition layer + admin UI surface that's overkill for back-end-only data. Reserve metaobjects for content types Kinga edits in the admin (e.g., ingredient cards, FAQ entries).

## Definition setup (one-time, in Shopify admin)

For Shopify to recognize these metafields with proper types + show them in the admin:

1. Settings → Custom data → Products → Add definition
   - Namespace and key: `mujo_commerce.stripe_product_id` → Type: Single line text
   - Namespace and key: `mujo_commerce.is_subscribable` → Type: True or false
2. Settings → Custom data → Variants → Add definition (×2)
   - `mujo_commerce.stripe_price_id_onetime`, `…_subscription` → Single line text each
3. Settings → Custom data → Customers → Add definition (×3)
   - `mujo_commerce.stripe_customer_id` → Single line text
   - `mujo_commerce.subscription_status` → Single line text (or pick "Choices" if you want a dropdown of allowed values)
   - `mujo_commerce.current_period_end` → Date
4. Settings → Custom data → Orders → Add definition (×5)
   - `mujo_commerce.stripe_charge_id` → Single line text
   - `mujo_commerce.stripe_checkout_session_id` → Single line text
   - `mujo_commerce.stripe_invoice_id` → Single line text
   - `mujo_commerce.stripe_subscription_id` → Single line text
   - `mujo_commerce.billing_reason` → Single line text

If a definition isn't pre-created, the metafield will still write (Shopify auto-creates an "ad-hoc" definition), but it won't appear nicely in the admin UI.

## Read patterns

### Storefront API (frontend rendering)

```graphql
query GetProductWithStripePrices($handle: String!) {
  product(handle: $handle) {
    title
    stripeProductId: metafield(namespace: "mujo_commerce", key: "stripe_product_id") { value }
    isSubscribable: metafield(namespace: "mujo_commerce", key: "is_subscribable") { value }
    variants(first: 10) {
      edges {
        node {
          title
          price { amount currencyCode }
          stripePriceIdOnetime: metafield(namespace: "mujo_commerce", key: "stripe_price_id_onetime") { value }
          stripePriceIdSubscription: metafield(namespace: "mujo_commerce", key: "stripe_price_id_subscription") { value }
        }
      }
    }
  }
}
```

### Admin API (webhook handlers writing)

See `lib/metafields.ts` — typed convenience wrappers around the `metafieldsSet` mutation.

## What we do NOT store as metafields

- Card data, payment method details — Stripe-only, never leaves Stripe
- Subscription full history — Stripe is authoritative; we mirror only current period + status
- Address details — Shopify customer.defaultAddress is authoritative
- Inventory levels — Shopify-only (Stripe doesn't track product inventory)

## Audit query

To see every Mujo metafield on a single resource (e.g., for support):

```graphql
{
  customer(id: "gid://shopify/Customer/123") {
    email
    metafields(first: 25, namespace: "mujo_commerce") {
      edges { node { key value type } }
    }
  }
}
```
