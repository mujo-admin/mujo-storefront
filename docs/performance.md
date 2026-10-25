# Performance: how the site stays fast on a phone

Since the 2026-10-25 speed pass (`perf/mobile-speed`), every money page scores 90+ in mobile Lighthouse (median of 5, Vercel preview). Before it they scored 57–67. Most traffic is mobile and paid, so these rules matter.

Background: AIOS `outputs/information-technology/mobile-speed-check-2026-10/` (`report.md` = the check, `results-after.md` = before/after) and `plans/2026-10-25-mobile-speed-fixes.md`.

## Imported pages (`lib/imported-html.ts` → `applySpeedPasses`)

These rules apply automatically to every page rendered with `<ImportedPage>`. Nothing has to change in the designed HTML.

| Rule | What it does | Why |
|---|---|---|
| **First screen** | The opening `<section>`s up to the first one with a picture (at most 2, starting in the first 6,000 characters of the body). | The hero. A page without one (journal posts) is left as written. |
| No fade-in on the first screen | `reveal` is removed there. | `.reveal` is `opacity:0` until the runtime runs, so the hero stayed blank for seconds on a phone. |
| Hero picture preloaded | The first-screen CSS background gets a raw `<link rel="preload" fetchpriority="high">`. A first `<img>` gets `fetchpriority="high"` instead. | CSS backgrounds are found late. The raw tag is needed because `ReactDOM.preload()` is dropped on the per-request render path (the layout reads the session cookie). |
| Lower pictures wait | Inline `background-image` below the first screen moves to `data-bg`. `useLazyMedia()` sets it within 800px of the screen; for a sideways carousel, all its pictures at once. | 26 pictures used to load at once on `/ritual`. |
| `<img>` lazy | `loading="lazy" decoding="async"` where no `loading` attribute is set. | Same reason. |
| Videos | `autoplay` off, `preload="none"`, `poster` → `data-poster`. Covers are set when the section is near; muted loops play while on screen. | The Ritual PDP downloaded 18 videos (~5.6 MB) on load. |
| Gallery thumbnails | `.gallery-thumb` backgrounds use the `-400.webp` version when it exists. | 70–120px tiles were loading 800px pictures. |

**Adding a page:** put the hero in the first `<section>` and write pictures as inline `background-image` or `<img>` as usual. Don't add `loading="lazy"` to the hero.

**Changing the helper:** run the content check before and after (below). The helper once silently deleted a whole FAQ.

## Buy boxes render with the page

`/ritual`, `/products/mujo-ritual` and `/products/protein-powder` pass `slots` and `provider` to `<ImportedPage>`:
- The body is parsed to React on the server (`html-react-parser`).
- The buy box and sticky bar render in place of their `data-mujo-mount` markers.
- `RitualSelectionProvider` / `ProteinSelectionProvider` share the selection between them.

Every other page keeps the HTML-string path. The buy box used to be portalled in after the code ran: 6–7 s on a phone, now ~2 s.

## Fonts

- Hanken Grotesk comes through `next/font/google` (`app/fonts.ts`), with `preload: false`, so it doesn't compete with the hero. The text swaps in from a size-matched stand-in.
- Instrument Serif and DM Mono are self-hosted in `public/fonts/`, with `@font-face` in `app/globals.css`. Instrument Serif regular is preloaded in `app/layout.tsx`.
- **`/media/*` rewrite (`next.config.ts`):** with `inlineCss: true`, next/font's font URLs stay relative (`../media/x.woff2`) and 404'd from every page. Hanken never loaded on the live site until 2026-10-25. Keep the rewrite while `inlineCss` is on.

## Marketing tags (`components/integrations/analytics-scripts.tsx`)

- Up front, only queues: Consent Mode defaults, `gtag()` with the GA4 config, and the `fbq` stub with init. Klaviyo's queue is `_klOnsite` (`lib/klaviyo-onsite.ts`).
- **gtag.js (GA4, directly; no GTM) and fbevents.js:** load at the first idle moment after window `load`.
- **Klaviyo:** loads at an idle moment 5 s or more after load.
- **On `/checkout`:** any tag not yet loaded waits for Stripe's form. `CheckoutReadySignal` in `embedded-checkout.tsx` fires `mujo:checkout-ready`, with an 8 s cap.
- New tags go here in code, not in GTM.
- **Trade-off:** a visitor who leaves before the page finishes loading is not counted as a GA4 or Meta page view. Purchases are unaffected (sent server-side from the Stripe webhook).

## Checkout

- Stripe.js (`lib/stripe-client.ts`) starts loading when the cart drawer opens with items, and again when `/checkout` mounts. It runs alongside the session request; it used to start only after it.
- `/api/checkout-session` caches Stripe price amounts per server instance (a Price's amount can't change).
- The session is **not** created when the drawer opens: that would send a checkout-started event to Meta and Klaviyo on every drawer open.

## Other

- `app/loading.tsx` fills the screen (`100svh`). At 60vh the footer showed under it on a first visit, then jumped.
- The announcement bar's phone rules live in `app/globals.css`, not styled-jsx. styled-jsx only arrives with the code, so the page jumped 17px.
- Cart drawer thumbnails use 400px pictures (`cartThumbUrl()` in `lib/cart/price-id-map.ts`). Emails and the product feed keep the full-size pictures.

## Re-measuring

From AIOS `outputs/information-technology/mobile-speed-check-2026-10/`:

```bash
bash run_lighthouse.sh https://mujoworld.com <out_dir> 5     # live, 7 money pages × 5
node summarise.js <out_dir>
node tap_test.mjs 3 phone https://mujoworld.com <out_dir>    # cart + checkout timing (DWELL=10000 for a typical shopper)
# protected Vercel preview: put the bypass key in a file, then
BYPASS_FILE=<file> node lh_protected.mjs <preview_url> <out_dir> 5
```

From the storefront repo:

```bash
node scripts/perf/content-check.mjs snap <base_url> <dir>       # every imported page: text, links, buttons, pictures, videos, FAQs + screenshots
node scripts/perf/content-check.mjs compare <before_dir> <after_dir>
node scripts/perf/tracking-check.mjs <base_url> /ritual          # GA4 / Meta / Klaviyo hits for one visit + add to cart
```

Local `next start` scores aren't comparable with live. Use them only to compare before and after on the same machine.
