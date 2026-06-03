# Loox Reviews — Headless Integration

Mujo uses **Loox** (loox.io) for product reviews. Loox is installed on the Shopify
backend (collects + stores reviews) on the **Convert plan**, which unlocks (a)
displaying widgets on this external/headless domain and (b) the Klaviyo
integration for branded, in-email review requests.

## How display works (no API key)

Loox's external-domain widget needs only the shop's myshopify domain
(`NEXT_PUBLIC_LOOX_SHOP_DOMAIN=get-mujo.myshopify.com`). Two widgets per PDP:

- **Reviews feed:** `<div id="looxReviews" data-product-id="{NUMERIC_ID}"></div>`
- **Star badge:** `<div class="loox-rating" data-fetch data-id="{NUMERIC_ID}"></div>`

Loox keys to the **numeric Shopify product ID**, not the handle.

## Where it lives in the code

- **`lib/loox.ts`** — `LOOX_SHOP_DOMAIN`, the `LOOX_PRODUCT_IDS` map (route slug →
  numeric product ID), `looxSlugFromPathname()`, and `renderLooxForSlug()`.
- **`components/imported-page-runtime.tsx`** — a `usePathname()`-keyed `useEffect`
  calls `renderLooxForSlug()` on PDP routes. This is the single re-init point.
- **PDP HTML** (`content/imported-html/`) — each PDP carries static (ID-less)
  `<div class="loox-rating">` near the title and a `<div id="looxReviews">` feed
  section. The runtime stamps the numeric ID on and renders.

The widget divs are plain markup (no inline JS, which the import loader strips).

## The SPA re-init (why we re-inject the script)

The storefront is a single-page app — App Router navigation between PDPs doesn't
reload the page, and Loox's script only scans the DOM when it loads. So
`renderLooxForSlug()`:

1. polls briefly for the page's `#looxReviews` / `.loox-rating` divs (the imported
   HTML may commit a beat after navigation),
2. stamps the numeric product ID for the current route, and
3. **re-injects** `https://loox.io/widget/loox.js?shop=…`, forcing a fresh scan +
   render against the new product.

This also scopes Loox to PDP routes — it never loads on non-product pages.
`loox.js` is cached after first load, so the re-fetch is effectively free.

> If Loox later publishes a stable client-side re-render method on `window.loox`,
> swap the re-inject in `renderLooxForSlug()` for that call (cheaper). The
> re-inject approach is the robust, vendor-API-agnostic default.

## Product ID map (resolved 2026-06-03)

| Route | Handle | Numeric product ID |
|-------|--------|--------------------|
| `/products/mujo-ritual` | `the-ritual` | `8855909597426` |
| `/products/mujo-frother` | `electric-frother` | `8907228840178` |
| `/products/mujo-crew` | `crew-neck-sweatshirt` | `8918766354674` |
| `/products/mujo-tee` | `mujo-t-shirt` | `8919013359858` |
| `/products/mujo-hat` | `mujo-baseball-hat` | `8931279110386` |

To re-resolve: query the Storefront API `productByHandle(handle:"…"){ id }` and
strip the `gid://shopify/Product/` prefix.

## Prerequisites (Loox dashboard + Vercel)

- **Loox:** Convert plan; external-domain display **enabled** and the storefront
  domain whitelisted (`mujo-storefront.vercel.app` for staging, `mujoworld.com`
  for prod).
- **Vercel:** `NEXT_PUBLIC_LOOX_SHOP_DOMAIN=get-mujo.myshopify.com` (Production +
  Preview). Public var, inlined at build → set before the build that should show
  reviews.

## Branded review requests via Klaviyo (collection)

Routes Loox's review-request emails through Mujo's own Klaviyo templates on
`mujoworld.com`, with in-email submission:

1. **Loox → connect Klaviyo** (Convert plan).
2. **Loox → review-request "Send via" = Klaviyo.**
3. **Klaviyo →** build/adjust the post-purchase review-request flow with a branded
   Mujo template + the **embedded Loox in-email review block** (customer submits
   from the email). Include a **photo-review incentive** (e.g. small discount) +
   sensible timing — this is what realizes Loox's higher collection rate.
4. **Optional** branches on the `Loox Review Posted` event (rating, photo/video
   flags): 5★ → referral/UGC ask; low rating → quiet service/win-back; tag
   advocates for the Lemna launch.

## Seeding + empty state

Merch PDPs had zero reviews at launch — seed at least one per product in the Loox
dashboard so the widget isn't empty. Ritual's real reviews display automatically.

## Deferred

- **Lemna** (`/products/lemna`) — not yet a purchasable Shopify product, so it has
  no numeric ID and is intentionally absent from `LOOX_PRODUCT_IDS` and its PDP
  still carries the old placeholder slot. Add a map entry + swap the slot at the
  Lemna launch-day flip; the runtime will pick it up automatically.
