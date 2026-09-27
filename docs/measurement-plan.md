# Mujo Measurement Plan

**Owner:** Mujo Storefront · **Created:** 2026-09-27
**Related:** `plans/explore-2026-09-27-tracking-rebuild-ga4-meta-catalog.md` (AIOS workspace)

The contract every tracking change is checked against. If GA4 and Meta ever
disagree about what happened, this file is the referee.

---

## Principles

1. **One announcer.** Application code calls `track()` from `lib/analytics.ts`.
   Nothing else pushes to `dataLayer` and nothing else calls `fbq` directly.
2. **One name per thing.** GA4 names are canonical (snake_case, GA4 ecommerce
   convention). Meta names are derived by the table below, never chosen ad hoc.
3. **Count once.** Any event with a server-side origin must not also be mirrored
   from the browser. The `mirror` column is the authority.
4. **The site is the only reporter.** Shopify's Facebook & Instagram data
   sharing is off. The storefront reports; Shopify supplies catalog only.

---

## Event table

| GA4 event | Meta event | Fires when | Server mirror | Key params |
|---|---|---|---|---|
| `page_view` | `PageView` | Every route change, including client-side nav | no | `page_path`, `page_title` |
| `view_item` | `ViewContent` | A PDP renders | **yes** | `items[]`, `value`, `currency` |
| `view_item_list` | — | Shop / collection grid renders | no | `item_list_name`, `items[]` |
| `add_to_cart` | `AddToCart` | `addItem()` in cart-context | **yes** | `items[]`, `value`, `currency` |
| `view_cart` | — | Cart drawer opens | no | `items[]`, `value` |
| `begin_checkout` | `InitiateCheckout` | Checkout button clicked | **no** — `/api/checkout` already sends CAPI | `items[]`, `value` |
| `purchase` | `Purchase` | Success page renders | **no** — Stripe webhook already sends CAPI | `transaction_id`, `value`, `currency` |
| `sign_up` | `Lead` | Klaviyo subscribe succeeds | **yes** | `method` (form source) |
| `generate_lead` | `Lead` | Ambassador application submitted | **yes** | `method: 'ambassador'` |

**Why `mirror` matters.** `begin_checkout` and `purchase` are already sent to
Meta's Conversions API server-side (`app/api/checkout/route.ts`,
`lib/webhook-handlers/*`). Mirroring them from the browser as well would send
each event twice from two different origins. The browser pixel still fires for
both — Meta deduplicates browser+server by `event_id` — but the *client* must
not also POST to `/api/meta/convert`.

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
  item_id: string;    // Stripe Price ID — the cart's primary key
  item_name: string;  // product title
  item_variant: string;
  price: number;      // major units (dollars), not cents
  quantity: number;
}
```

Meta's equivalents (`content_ids`, `content_type: 'product'`, `contents`) are
derived from this inside `lib/analytics.ts`. Call sites never build them.

## Consent

Google Consent Mode v2 is initialised **before** GTM loads.

- Default outside the EEA/UK: granted (Mujo ships US-only)
- Default inside the EEA/UK: denied until the visitor accepts
- Every visitor gets a banner and can opt out; the choice persists in
  `localStorage` under `mujo_consent` and updates consent state live

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
