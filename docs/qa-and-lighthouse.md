# Mobile QA + Lighthouse — pre-cutover checklist

> Run before flipping DNS in `docs/w3-runbook.md`.
> Goal: every public route returns 200, renders correctly on a real iPhone, and scores Lighthouse mobile ≥90 across Performance / Accessibility / Best Practices / SEO.

---

## 1. Real-device walkthrough (Kinga, ~30 min)

Open every route on a real iPhone in **Safari + Chrome iOS**. Verify:

| Route | What to check |
|---|---|
| `/` | Hero renders, sticky nav stays fixed on scroll, cart icon shows badge if items |
| `/ritual` | Mid-page Klaviyo gate slides up, sticky bottom CTA reveals after hero scroll |
| `/products/mujo-ritual` | "Add to cart" → cart drawer opens, qty adjuster works, "Subscribe & save" toggle reflects in price, Loox star badge + reviews feed render |
| `/lemna` | Direct-URL only (not in nav). Form submit → email capture |
| `/lemna/shop` | Flavor selector, "Pre-order" CTA |
| `/products/lemna` | 250-cap counter visible, founding-member CTA |
| `/shop` | Category filters work, all product cards render |
| `/ingredients` | All ingredient cards render with dose info |
| `/science` | Paper grain overlay visible (subtle), Comic frame illustrations render |
| `/rebel-club` | Tribe selector, email capture form |
| `/ambassador` | Form submit, copy says "Ambassador" not "Affiliate" except FTC link |
| `/about` | Founder photo placeholder, timeline section |
| `/contact` | Form submit → success state, FAQ accordion expands |
| `/journal` | Category chips, post grid, newsletter form at bottom |
| `/journal/[any-slug]` | Renders post template (placeholder content acceptable pre-launch) |
| `/legal/*` (8 pages) | TOC sidebar, anchor links work |
| `/404` (visit `/foo`) | 404 page renders with suggestion links |

### Mobile-floor checks (every route)

- [ ] Body text ≥18px (mobile-first floor per Brand Guide v1.0)
- [ ] Hero H1 renders ≥36px on mobile
- [ ] Tap targets ≥44×44px
- [ ] Sticky nav visible on scroll
- [ ] Mobile menu opens on hamburger tap, closes on close button + Escape
- [ ] Cart drawer opens on cart icon tap, closes on × + Escape
- [ ] Free-shipping band fills proportionally, flips to "unlocked" at $60
- [ ] No horizontal scroll on any viewport (320, 375, 390, 430, 768)

---

## 2. Lighthouse mobile audit

Run via Chrome DevTools → Lighthouse → Mobile, on `https://mujo-storefront.vercel.app/{route}`. Save reports to `outputs/website-migration/lighthouse-pre-cutover.md`.

**Go-live bar:** ≥90 on all 4 categories on every public route (19 total).

### Common fixes if scores miss

| Symptom | Fix |
|---|---|
| LCP > 2.5s | Verify Fontshare + Google Fonts CDN preconnect in `<head>` (already wired). Check Vercel Edge cache hit. |
| CLS > 0.1 | Add explicit `width`/`height` to all `<img>` tags. Imported HTMLs may need patches. |
| TBT > 200ms | Confirm Klaviyo + Pixel scripts are `strategy="lazyOnload"` (already wired). |
| Accessibility < 90 | Run axe DevTools — common issues: missing alt text on imported `<img>`, color contrast on placeholder dashed borders. |
| SEO < 90 | Confirm `<meta name="description">` per route (page metadata exports), schema.org JSON-LD validates. |

---

## 3. Schema.org validation

Test these routes at https://validator.schema.org/ before cutover:

- [ ] `/` (WebSite + Organization)
- [ ] `/ritual` (WebPage + Brand)
- [ ] `/products/mujo-ritual` (Product + Offer + BreadcrumbList)
- [ ] `/products/lemna` (Product + Offer + BreadcrumbList — note PreOrder availability)
- [ ] `/lemna` (WebPage + Brand)
- [ ] `/lemna/shop` (CollectionPage)
- [ ] `/shop` (CollectionPage)
- [ ] `/journal/{any-slug}` (Article + Person)
- [ ] `/about` (AboutPage)
- [ ] `/contact` (ContactPage)

---

## 4. Functional smoke tests (pre-cutover, against staging)

### Klaviyo capture
- [ ] Submit Lemna landing email gate with throwaway address — confirm in Klaviyo Activity Feed
- [ ] Submit Rebel Club form — confirm in Klaviyo with tribe property
- [ ] Submit Contact form — confirm email arrives at kinga@mujoworld.com AND profile in Klaviyo Contact list
- [ ] Submit Journal newsletter footer — confirm in Klaviyo

### Stripe checkout (no card; just verify redirect URL)
- [ ] Click Ritual one-time CTA → POST to `/api/checkout` returns `url: 'https://checkout.stripe.com/...'`
- [ ] Click Ritual subscribe CTA → POST to `/api/checkout` returns `url: 'https://checkout.stripe.com/...'` with mode=subscription
- [ ] Lemna PDP buttons go to waitlist form (not Stripe — wired post-launch)

### Meta Pixel
- [ ] Install Meta Pixel Helper Chrome extension
- [ ] Visit every public route — confirm green PageView
- [ ] Click any Stripe checkout CTA — confirm green InitiateCheckout
- [ ] Events Manager → Test Events: with `META_CAPI_TEST_EVENT_CODE` set, confirm paired client + server events with matching `event_id`

### Magic-link Billing Portal
- [ ] Click "Manage subscription" in footer
- [ ] Enter test email → confirmation message appears regardless of whether email is on file (anti-enumeration)
- [ ] If test email is on file, magic link arrives → clicks through to Stripe Billing Portal

---

## 5. SEO crawlability sanity

- [ ] Visit `https://mujo-storefront.vercel.app/sitemap.xml` — confirm 19 public routes; Lemna trio + /api + /account excluded
- [ ] Visit `https://mujo-storefront.vercel.app/robots.txt` — confirm Disallow: /lemna, /lemna/shop, /products/lemna, /migrate, /api/, /account/
- [ ] View source on `/lemna` — confirm `<meta name="robots" content="noindex, nofollow">`
- [ ] View source on `/lemna/shop` — confirm `<link rel="canonical" href="https://mujoworld.com/products/lemna">`
- [ ] OG preview test — paste `https://mujo-storefront.vercel.app/` into Slack/Twitter — confirm Mujo OG image renders

---

## Sign-off

When every box above is checked, paste a sign-off note at the top of `docs/w3-runbook.md` and proceed to cutover.
