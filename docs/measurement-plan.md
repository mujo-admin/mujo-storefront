# Mujo Measurement Plan

**Owner:** Mujo Storefront · **Created:** 2026-09-27 · **Tracking v2:** 2026-10-06
**Related (AIOS workspace):** `plans/explore-2026-09-27-tracking-rebuild-ga4-meta-catalog.md`,
`plans/2026-10-05-tracking-v2-retargeting-klaviyo.md`

The contract every tracking change is checked against. If GA4, Meta and Klaviyo
ever disagree about what happened, this file is the referee.

---

## Principles

1. **One announcer.** Application code calls `track()` (and `identify()`) from
   `lib/analytics.ts`. Nothing else pushes to `dataLayer`, calls `fbq`, or
   calls klaviyo.js directly.
2. **One name per thing.** GA4 names are canonical (snake_case, GA4 ecommerce
   convention). Meta names are derived by the table below, never chosen ad hoc.
3. **Count once.** Any event with a server-side origin must not also be mirrored
   from the browser. The `mirror` column is the authority.
4. **The site is the only reporter.** Shopify's Facebook & Instagram data
   sharing is off. The storefront reports; Shopify supplies catalog only.
5. **One product ID.** `item_id` is the Shopify handle (`the-ritual`), identical
   to the product feed `g:id`. It comes from `lib/product-identity.ts` and
   nowhere else. Stripe Price IDs are secondary (`price_id`), never the key.
6. **No typed prices.** Tracked prices come from the same price map the cart
   uses (`lib/cart/price-id-map.ts`, `lib/cart/merch-config.ts`).

---

## Event table

| GA4 event          | Meta event         | Klaviyo metric                    | Fires when                                               | Server mirror                                      | Key params                                                               |
| ------------------ | ------------------ | --------------------------------- | -------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------ |
| `page_view`        | `PageView`         | —                                 | Every route change, including client-side nav            | no                                                 | `page_path`, `page_title`                                                |
| `view_item_list`   | —                  | —                                 | A page shows two or more product tiles                   | no                                                 | `item_list_name`, `items[]`                                              |
| `select_item`      | —                  | —                                 | A product tile is clicked                                | no                                                 | `item_list_name`, `items[]`                                              |
| `view_item`        | `ViewContent`      | **Viewed Product**                | A PDP renders                                            | **yes**                                            | `items[]`, `value`, `currency`                                           |
| `add_to_cart`      | `AddToCart`        | **Added to Cart**                 | `addItem()`, or a quantity increase, in cart-context     | **yes**                                            | `items[]`, `value`, `purchase_type`                                      |
| `remove_from_cart` | —                  | —                                 | A line is removed, or its quantity reduced               | no                                                 | `items[]`, `value`                                                       |
| `view_cart`        | —                  | —                                 | Cart drawer opens                                        | no                                                 | `items[]`, `value`                                                       |
| `begin_checkout`   | `InitiateCheckout` | **Started Checkout**              | A checkout session is created for a cart (once per cart) | **no**: `/api/checkout-session` already sends CAPI | `items[]`, `value`, `purchase_type`                                      |
| `purchase`         | `Purchase`         | — (server sends **Order Placed**) | Success page renders                                     | **no**: Stripe webhook already sends CAPI          | `transaction_id`, `value`, `tax`, `shipping`, `items[]`, `purchase_type` |
| `sign_up`          | `Lead`             | — (identify)                      | A signup form is submitted                               | **yes**                                            | `method` (form source)                                                   |
| `generate_lead`    | `Lead`             | — (identify)                      | Ambassador application submitted                         | **yes**                                            | `method: 'ambassador'`                                                   |

Server-only events (no browser counterpart):

| Event                  | Destination | Sent by                            | When                                                               |
| ---------------------- | ----------- | ---------------------------------- | ------------------------------------------------------------------ |
| `InitiateCheckout`     | Meta CAPI   | `/api/checkout-session`            | Session created                                                    |
| `Purchase`             | Meta CAPI   | Stripe webhook handlers            | First paid order (not renewals, not the pre-order ship-day charge) |
| **Order Placed**       | Klaviyo     | Stripe webhook handlers            | Same                                                               |
| **Checkout Abandoned** | Klaviyo     | `checkout.session.expired` handler | An unpaid session expires and Stripe returns a usable email        |

**Why `mirror` matters.** `begin_checkout` and `purchase` are already sent to
Meta's Conversions API server-side (`app/api/checkout/route.ts`,
`lib/webhook-handlers/*`). Mirroring them from the browser as well would send
each event twice from two different origins. The browser pixel still fires for
both — Meta deduplicates browser+server by `event_id` — but the *client* must
not also POST to `/api/meta/convert`.

## How events reach GA4

`track()` calls `gtag('event', name, { …, send_to: <GA4 id> })`, which goes
straight to the GA4 property. It also pushes the same event to `dataLayer` so a
future tag in GTM (Google Ads, for example) can use it.

The GTM container holds one tag: the Google tag for `G-7BFMH4PZRD`. **Do not
add GA4 event tags in GTM for the events in the table above**; the code already
sends them and each would be counted twice. Until 2026-10-06 only the
`dataLayer` push existed, the container forwarded nothing, and GA4 received page
views only: there is no ecommerce history in GA4 before that date.

`page_view` is not sent by `track()` to GA4. Enhanced measurement sends it on
every load and in-site navigation.

## Event ID and deduplication

Every Meta-bound event carries an `event_id`. The browser pixel and the server
CAPI call send the **same** id, so Meta counts one event.

- Client-originated events: `track()` generates the id and passes it to both.
- Server-originated events (`purchase`, `begin_checkout`): the server generates
  the id and hands it to the client, which passes it to the pixel. Already
  implemented — see `app/checkout/success/success-client.tsx`.

## Ecommerce item shape

GA4 ecommerce expects `items[]`. One shape, used everywhere:

```ts
{
  item_id: string;        // Shopify handle = feed g:id, e.g. "the-ritual"
  item_name: string;      // product name, e.g. "The Ritual"
  item_variant?: string;  // "25 servings · Subscribe · every 4 weeks"
  purchase_type?: "subscription" | "onetime";
  price_id?: string;      // Stripe Price ID, secondary
  price: number;          // major units (dollars), not cents
  quantity: number;
}
```

One product is one row in GA4. Subscription against one-time is compared with
`purchase_type`, which also rides at event level on `add_to_cart`,
`begin_checkout` and `purchase`.

Meta's equivalents (`content_ids`, `content_type: 'product'`, `contents`) are
derived from this: in `lib/analytics.ts` for the browser and
`metaCustomData()` in `lib/analytics-server.ts` for the server. Call sites never
build them. The free first-order frother is never an item (a gift is not a
purchased product).

IDs changed on 2026-10-06 (go-live of Tracking v2): before that date GA4 product
rows are split between `price_…` IDs and route slugs.

## Adding a product

1. Add it to `PRODUCTS` in `lib/product-identity.ts` (slug, Shopify handle, name, route).
2. Add its Prices to the price maps as usual.
3. Run `pnpm test:identity` and `pnpm tsx scripts/validate-feed.ts`.

## Klaviyo

**One origin per metric.** A metric is sent from the browser or from the server,
never both.

| Metric             | Origin               | Notes                                                           |
| ------------------ | -------------------- | --------------------------------------------------------------- |
| Viewed Product     | browser (klaviyo.js) | Also feeds "recently viewed" via `trackViewedItem`              |
| Added to Cart      | browser              | Whole cart in `Items[]`, plus `CheckoutURL`                     |
| Started Checkout   | browser              | Whole cart, `CheckoutURL`, `$event_id` = checkout event id      |
| Order Placed       | server (webhook)     | `Items[]`, `OrderId`, `UTMSource` / `UTMMedium` / `UTMCampaign` |
| Checkout Abandoned | server (webhook)     | `Items[]`, `CheckoutURL`; one per person per day                |

`Items[]` is the same on every metric (`lib/klaviyo-onsite.ts`): `ProductID`,
`ProductName`, `Variant`, `Quantity`, `ItemPrice`, `RowTotal`, `ProductURL`,
`ImageURL`, `PurchaseType`. Email templates can loop over it without caring
which event started the flow.

**Klaviyo only records visitors it can name.** klaviyo.js holds events from an
anonymous browser and sends them once that browser is identified. `identify()`
is called after a signup form, an ambassador application, a magic-link login
(`<KlaviyoIdentify />`) and a purchase. A click from a Klaviyo email identifies
the browser too. Expect low counts at first.

**`CheckoutURL` is a cart restore link** (`/cart/restore?i=…`, see
`lib/cart/restore.ts`). It rebuilds the cart at today's prices and opens the
cart drawer on the product page.

**Checkout Abandoned rules** (`lib/webhook-handlers/checkout-expired.ts`):
sessions expire after 1 hour; an email is used only if the shopper ticked
Stripe's promotional box or is an existing customer; nothing is sent if the
same email completed a checkout in the previous 6 hours; nobody is added to a
list. The tickbox is on only where `STRIPE_PROMO_CONSENT_ENABLED=true`.

## Attribution

How a sale reported by the server still knows which ad it came from.

1. **On landing**, `captureAttribution()` (`lib/attribution.ts`) saves
   `utm_*`, `gclid`, `fbclid`, `gbraid`, `wbraid` and the landing path to the
   first-party cookie `mujo_attr` (90 days, last non-direct touch wins).
2. **At checkout**, `/api/checkout-session` reads that cookie plus `_fbp`,
   `_fbc`, `_ga` and the GA4 session cookie from the request and stores them in
   Stripe metadata on the session and, for subscriptions, on the subscription:
   `fbp`, `fbc`, `ga_client_id`, `ga_session_id`, `attr_utm_*`, `attr_gclid`,
   `attr_fbclid`, `attr_landing_page`, `client_ip`, `client_ua`, `restore`.
3. **On payment**, the webhook handlers read it back and pass `fbp`, `fbc`, IP
   and user agent to Meta CAPI `Purchase`, and the UTM fields to Klaviyo
   "Order Placed".

Not built yet: a server-side GA4 `purchase` fallback for shoppers who never
reach the success page. The GA4 ids are already stored for it; it needs a GA4
Measurement Protocol secret.

## Consent

Google Consent Mode v2 is initialised **before** GTM loads.

- Default outside the EEA/UK: granted (Mujo ships US-only)
- Default inside the EEA/UK: denied until the visitor accepts
- Every visitor gets a banner and can opt out; the choice persists in
  `localStorage` under `mujo_consent` and updates consent state live
- A visitor who chose "No thanks" gets no klaviyo.js calls, no `mujo_attr`
  cookie, and no attribution stored on their checkout session

## What is deliberately not tracked

- Scroll depth, rage clicks, session recording — not worth the weight
- Anything identifying beyond hashed email inside Meta CAPI
- Server-side GTM — revisit above ~50k sessions/month

## Verification checklist

Before any tracking change ships:

1. GA4 DebugView shows the event with the expected params
2. Meta Events Manager Test Events shows the matching event
3. For mirrored events, Events Manager shows **one** event, not two
4. No console errors with an ad blocker enabled
5. Lighthouse mobile has not regressed more than 3 points
6. Klaviyo: the test profile's activity feed shows the metric with `Items[]`
7. `pnpm test:identity` and `pnpm tsx scripts/validate-feed.ts` pass
8. Server events: `pnpm tsx scripts/replay-stripe-event.ts --for <id>
--print-analytics` prints what Klaviyo and Meta would receive, without sending

The full walk-through is `docs/tracking-v2-test-script.md`.
