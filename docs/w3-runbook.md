# W3 Cutover runbook

> One-shot DNS flip from old Shopify Liquid theme to the headless Vercel deploy. Plan: `plans/2026-04-28-w3-storefront-port-new-htmls.md` Phase 6.
> Estimated total time: ~2-3h Claude + 75 min Kinga across ~10 checkpoints.
> **Target window:** before 2026-05-26 (Vercel Pro trial expiry). If slipping, upgrade Pro on flip day at standard $20/mo.

---

## Pre-flight checks (T-48h)

- [ ] `docs/qa-and-lighthouse.md` sign-off complete. Lighthouse mobile ≥90 on all 19 public routes.
- [ ] Schema.org validates on all 10 schema-bearing routes.
- [ ] Stripe live keys verified in Vercel Production env: `vercel env ls production | grep STRIPE_SECRET_KEY` returns `sk_live_*` (not `sk_test_*`).
- [ ] All Phase 3 keys present in Vercel Production env:
  - `NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY`, `KLAVIYO_PRIVATE_KEY`
  - `KLAVIYO_LIST_ID_LEMNA_WAITLIST`, `KLAVIYO_LIST_ID_AMBASSADOR_APPLICATIONS`, `KLAVIYO_LIST_ID_CONTACT_FORM`, `KLAVIYO_LIST_ID_JOURNAL_NEWSLETTER`
  - `NEXT_PUBLIC_META_PIXEL_ID`, `META_CAPI_TOKEN`
  - (`META_CAPI_TEST_EVENT_CODE` should NOT be in production env post-cutover; remove if present)
- [ ] Subscriber migration complete (Loop/Skio → Stripe) — verified by spot-checking 5-10 customers in Stripe dashboard.
- [ ] Loox external domains whitelisted: `mujoworld.com` + `www.mujoworld.com` added in Loox → Settings → General → External domains. (Loox blocks the reviews feed on any non-whitelisted domain; it could NOT be verified on the `*.vercel.app` staging host because Loox forces a `www.` prefix that Vercel's platform subdomain can't serve. Code is verified working — the star badge renders on staging. See `docs/loox-reviews.md`.)

### Baseline analytics snapshot (Kinga, ~10 min)

Capture screenshots/exports of the **last 7 days** from:
- GA4 (or current analytics): sessions, conversion rate, top pages
- Shopify Liquid: revenue, orders, conversion rate
- Meta Ads Manager: CPM, CTR, CPA, ROAS

Save to: `outputs/website-migration/baseline-pre-cutover-{YYYY-MM-DD}.md`.

### Registrar TTL drop (Kinga, ~5 min)

Drop TTL on `mujoworld.com` and `www.mujoworld.com` A/CNAME records from default (3600s) to 300s. This shortens the window during which a botched cutover could leave traffic stuck on the old theme.

**Verify:** screenshot of registrar TTL change.

---

## Cutover sequence (T-0)

Run in this exact order. Each step has a who + ~time + verification.

### Step 1 — Pause Meta ads (Kinga, 2 min)

Pause every active ad set in Meta Ads Manager. This prevents traffic landing on a half-flipped DNS cache.

### Step 2 — Verify Stripe live keys on Vercel (Claude, 5 min)

```sh
cd ~/Documents/Mujo\ AI/mujo-storefront
vercel env ls production | grep STRIPE
```

If `STRIPE_SECRET_KEY` is `sk_test_*`, swap to `sk_live_*` and trigger redeploy:
```sh
vercel env rm STRIPE_SECRET_KEY production
vercel env add STRIPE_SECRET_KEY production  # paste sk_live_*
vercel deploy --prod
```

### Step 3 — Vercel Pro upgrade (Kinga, 5 min)

Vercel dashboard → Settings → Billing → Upgrade to Pro ($20/mo).
**Verify:** dashboard shows "Pro" badge.

### Step 4 — Add custom domain in Vercel (Claude or Kinga, 3 min)

```sh
vercel domains add mujoworld.com
vercel domains add www.mujoworld.com
```
Or via dashboard: Project → Settings → Domains → Add.

### Step 5 — DNS records at registrar (Kinga, 10 min)

Vercel-recommended values (pulled from the project config 2026-04-29):

**Apex `mujoworld.com`** — A record. Use ONE of these IPs (all valid; pick the first):
- `216.150.1.1` (Vercel rank 1, newest infrastructure)
- `76.76.21.21` (rank 2, fallback)

**`www.mujoworld.com`** — CNAME to:
- `27bb3766a1fd1238.vercel-dns-017.com.` (project-specific, rank 1)
- OR `cname.vercel-dns.com.` (generic, rank 2 — this is what most Vercel docs show)

GoDaddy steps:
1. DNS settings for `mujoworld.com` → Records
2. Edit existing A record `@` → set Value to `216.150.1.1` (delete duplicate A records pointing to Shopify)
3. Edit/create CNAME `www` → set Points to to `cname.vercel-dns.com.` (trailing dot)
4. TTL on both → `1/2 hour` (close to 300s — registrar may not accept exact 300)
5. Save

**Verify (Claude can run this for you):**
```sh
dig mujoworld.com +short        # should return 216.150.1.1 within 5 min
dig www.mujoworld.com +short    # should return cname.vercel-dns.com → Vercel IP
curl -sI https://mujoworld.com | head -3   # should return 200 OK once SSL provisions
```

**Alternative — full Vercel-managed DNS (heavier, only if you want everything at Vercel):**
Update the registrar's nameservers (NOT individual records) to:
- `ns1.vercel-dns-3.com`
- `ns2.vercel-dns-3.com`
- `ns3.vercel-dns-3.com`
- `ns4.vercel-dns-3.com`

Don't do this unless you're committing email DNS to Vercel as well — currently your Resend MX is on `send.mujoworld.com` and Google Workspace MX is on the apex. Keeping records at GoDaddy preserves that.

### Step 6 — SSL provisions (5-15 min, automatic)

Vercel auto-issues a Let's Encrypt certificate. Watch the project's Domains tab — both `mujoworld.com` and `www.mujoworld.com` should show "Valid Configuration" green.

**Verify:** `https://mujoworld.com` resolves with valid cert. `curl -sI https://mujoworld.com | head -5` shows `200 OK`.

### Step 7 — Smoke test purchases (Claude + Kinga, 20 min)

**Real card. Both purchases refunded immediately via Stripe dashboard. Budget ~$92 in temporary charges + ~$2-3 in unrecoverable Stripe processing fees.**

#### 7a. $27 one-time Ritual purchase
- Visit `https://mujoworld.com/products/mujo-ritual`
- Click "Add to cart" → cart drawer
- Click checkout → Stripe Checkout
- Pay with real card (Kinga's)
- After redirect to success URL, verify:
  - [ ] Stripe dashboard shows the charge under your live account
  - [ ] Shopify Admin → Orders shows new order with tags `[stripe-checkout, one-time]`
  - [ ] Klaviyo Activity Feed shows `Order Placed` event for the email
  - [ ] Meta Events Manager → Test Events shows paired `Purchase` events (client + server) with matching `event_id`
- Refund the charge in Stripe dashboard

#### 7b. $65/mo subscription Ritual purchase
- Repeat with subscription CTA
- Verify all the same checks PLUS:
  - [ ] Stripe dashboard shows active subscription
  - [ ] Shopify customer metafields: `mujo_commerce.subscription_status: active`, `current_period_end: <date>`, `stripe_customer_id: cus_*`
  - [ ] Click "Manage subscription" in footer → enter Kinga's email → magic link arrives → clicks through to Stripe Billing Portal
- Cancel subscription in Stripe Billing Portal
- Verify cancellation cascade: `customer.subscription.updated` webhook fires, Shopify metafield updates within ~30s

#### 7c. Loox reviews render on the live domain

On `https://mujoworld.com/products/mujo-ritual` (and one merch PDP, e.g. `/products/mujo-crew`), verify:
- the **star badge** by the title shows the real average + count and is **clickable** (scrolls to the feed),
- the **full reviews feed** (`#looxReviews`) renders below the curated cards with real/seeded reviews,
- clicking from one PDP to another (no page reload) re-renders the feed against the new product.

If the feed is blank: confirm both `mujoworld.com` and `www.mujoworld.com` are in Loox → External domains (the pre-flight item).

### Step 8 — Unpublish old Liquid theme (Kinga, 2 min)

Shopify Admin → Online Store → Themes → Old theme → Actions → **Unpublish** (NOT delete; recoverable for 30 days as the rollback path).

**Verify:** Old theme shows as "Unpublished"; new traffic now hits Vercel headless only.

### Step 8b — Submit new sitemap to Google Search Console (Kinga, 3 min)

The `mujoworld.com` **Domain property already exists** in Search Console (verified 2026-06-09 — no need to add it; the earlier "add a domain property" note was already complete). The real cutover-day GSC action is submitting the headless sitemap now that the new site serves the domain:

1. Search Console → select the **`mujoworld.com` Domain property** (not the `https://www.mujoworld.com/` URL-prefix one).
2. Left nav → **Sitemaps** → enter `sitemap.xml` → **Submit**.
3. Confirm it reads "Success" (may show "Couldn't fetch" for a few minutes until Google crawls — recheck within the hour).

This points Google at the headless `app/sitemap.ts` output (the new 19-route sitemap) so the migrated routes get re-crawled promptly instead of waiting on organic discovery. The Lemna trio stays `noindex` + robots-disallowed regardless, so it won't be indexed early.

**Verify:** Sitemaps page lists `sitemap.xml` with status Success and a discovered-URL count > 0.

### Step 9 — Re-enable ONE Meta ad set (Kinga, 3 min)

Pick the lowest-spend ad set. Re-enable it. Let it run for 4 hours.

### Step 10 — Monitor 4h (Claude + Kinga checks at +1h, +2h, +4h)

Watch for regressions in:
- Vercel function logs (`vercel logs --follow`)
- Stripe dashboard (failed charges, webhook errors)
- Shopify Orders feed (orders flowing in with correct metafields)
- Meta Pixel Helper (Pixel firing on every page)
- Klaviyo Activity Feed (events arriving)

**Decision at T+4h:**
- **Healthy:** Re-enable remaining ad sets. Cutover complete.
- **Regressions:** Roll back via Step 11 below.

---

## Rollback path (only if needed)

If smoke test fails OR T+4h shows regressions:

1. Registrar: revert DNS records to old Shopify pointer (TTL is 300s, so traffic snaps back in 5 min).
2. Shopify Admin → Themes → Old theme → Actions → **Publish**.
3. Pause Meta ads again.
4. Diagnose the issue from Vercel function logs + Stripe webhook errors.
5. Root-cause fix on staging, redeploy, then re-attempt cutover.

**No data loss:** Stripe + Shopify both intact during rollback.

---

## Post-cutover stabilization

### Day +14 — Loop/Skio uninstall (Kinga, ~10 min)

Confirm:
- All subscribers migrated to Stripe (cross-check in Stripe customer list).
- No active Loop/Skio subscriptions remaining.

Then:
- Shopify Admin → Apps → Loop Subscriptions → Uninstall
- Shopify Admin → Apps → Skio Subscriptions → Uninstall

**Confirms ~$100/mo savings target of the headless pivot.**

### Day +30 — Old Liquid theme deletion + debrief

- Shopify Admin → Themes → Old theme → Actions → **Delete** (only after stable window).
- Claude writes `outputs/website-migration/w3-debrief-{YYYY-MM-DD}.md`:
  - Conversion rate before/after (homepage, Ritual landing, Ritual PDP)
  - Route-level traffic (top 10 by pageviews)
  - Issues encountered + fixes
  - Loop + Skio savings confirmed
  - Lighthouse mobile scores per route (post-cutover)
  - Pixel + CAPI dedup rate (Events Manager → "Event match quality")
  - Klaviyo abandoned-checkout flow performance
  - Recommendations for v2 (account pages) timing.

---

## Quick reference

| Action | Command |
|---|---|
| Tail Vercel logs | `vercel logs --follow` |
| List prod env | `vercel env ls production` |
| Rollback DNS | Registrar → revert A + CNAME → old Shopify pointer |
| Refund Stripe charge | Stripe dashboard → Payments → charge → Refund |
| Cancel Stripe sub | Stripe dashboard → Subscriptions → cancel |

**On-call channels:** kinga@mujoworld.com.

**Contacts at flip time:** none required pre-arranged; Vercel/Stripe/Resend support available via dashboards.
