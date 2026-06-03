# Environment Variables Reference

This document explains every env var the Mujo Storefront uses. The canonical inventory is in `.env.example` (committed). Actual values live in `.env.local` (gitignored locally) and Vercel project settings (production deploys).

W1 ships **Shopify reads + Postgres**. W2 adds **Stripe + Resend + Admin API**. W3 adds **Klaviyo + Meta + Loox**.

---

## How to update an env var

| Where | When |
|---|---|
| `.env.local` | Local dev only — for `pnpm dev` on your laptop |
| Vercel project | All deployed environments — production, preview, development |

Vercel CLI: `vercel env add VAR_NAME production` (one env per call). Or via dashboard: Settings → Environment Variables.

After changing a Vercel env var, the existing deployments don't auto-pick it up. Trigger a redeploy: `vercel --prod` or push a commit.

---

## Shopify Storefront API (W1)

`SHOPIFY_STORE_DOMAIN`
The canonical myshopify subdomain. **`get-mujo.myshopify.com`** for Mujo. Note this is *not* the admin URL handle (`mujoworld`) — Shopify keeps the original subdomain forever after store renames.

`SHOPIFY_STOREFRONT_ACCESS_TOKEN`
The **Public access token** from the Headless sales channel. 32-char hex string, no prefix. Get it from: Shopify admin → Headless channel → Mujo Headless storefront → Storefront API → Manage → Public access token. **Do not use the `shpat_` Private token** — Vercel Commerce's `X-Shopify-Storefront-Access-Token` header only accepts the Public token despite Shopify's UI labeling the Private one as "for server-side contexts." Counter-intuitive but verified.

`SHOPIFY_REVALIDATION_SECRET`
Random hex string used to authenticate Shopify webhooks calling `/api/revalidate`. Generate with `openssl rand -hex 32`. Rotate quarterly.

## Shopify Admin API (W2 — empty in W1)

`SHOPIFY_ADMIN_API_ACCESS_TOKEN`
Empty in W1. W2 will populate via the Headless channel's Admin token (if available) or Dev Dashboard custom-distribution OAuth flow.

`SHOPIFY_ADMIN_API_VERSION`
Currently `2025-01`. Shopify's current is `2026-04`; update annually. Old API versions are supported for ~12 months after release.

## Stripe (W2 — empty in W1)

`STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET`
Test-mode keys (`sk_test_…`, `pk_test_…`, `whsec_…`) for W2 development. Live-mode keys swap in at W3 cutover. Get from Stripe dashboard → Developers → API keys.

`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
Same value as `STRIPE_PUBLISHABLE_KEY`, exposed to the browser for `loadStripe()` in the on-site checkout's `<Elements />` provider. Stripe publishable keys are not secret — exposing them to the client is the documented pattern.

`STRIPE_SHIPPING_FREE_ID` / `STRIPE_SHIPPING_FLAT_ID`
Stripe Shipping Rate IDs created by W2's `mirror-shopify-to-stripe.ts` script. Free if order ≥ $50, $5 flat otherwise.

## On-site checkout + accounts (added 2026-05-07 per `plans/2026-05-07-on-site-checkout-and-accounts.md`)

`MUJO_SESSION_SECRET`
HMAC secret for the `mujo_session` JWT cookie (7-day TTL, sliding refresh) used by the customer account magic-link login. Generate with `openssl rand -base64 32`. **Distinct from `MAGIC_LINK_SECRET`** — different rotation cadence + security domain. Rotating one must not invalidate the other.

`EMAIL_CHANGE_SECRET`
HMAC secret for the `audience: 'email-change'` magic-link tokens (24-hour TTL, sent to the *new* email address before commit). Generate with `openssl rand -base64 32`. Distinct from session + billing-portal secrets per the three-audience separation.

## Vercel Postgres / Neon (W1 wired, schema empty)

`POSTGRES_URL` / `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING`
Pooled and unpooled Postgres connection strings. Auto-injected by Vercel when the Postgres integration is connected to the project. Use `_NON_POOLING` for migrations and one-off scripts; pooled `POSTGRES_URL` for runtime queries.

`POSTGRES_HOST` / `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DATABASE`
Component parts of the connection string. Convenient for tools that want them split.

`PGDATABASE` / `PGHOST` / `PGUSER` / `PGPASSWORD`
Standard libpq env vars. Same values as the `POSTGRES_*` equivalents — for `psql` CLI compatibility.

`DATABASE_URL` / `DATABASE_URL_UNPOOLED`
Aliases for `POSTGRES_URL` / `POSTGRES_URL_NON_POOLING`. Some ORMs (Prisma) default to reading these.

`NEON_PROJECT_ID`
Neon's internal project ID. Used by the Neon serverless driver in some configurations.

To pull these locally: `vercel env pull .env.local` (or `.env.local.vercel` to avoid clobber).

## Resend (W2 — empty in W1)

`RESEND_API_KEY`
Sending key for transactional email — magic-link portal access (W2), subscriber migration (W2), order confirmations (W3+).

`RESEND_FROM_EMAIL`
Default sending address. **`hello@mujo.life`** for Mujo. Domain must be verified in Resend dashboard with SPF + DKIM + DMARC DNS records.

`MAGIC_LINK_SECRET`
64-char random hex used to sign JWT tokens for the Stripe Billing Portal magic-link flow. Generate with `openssl rand -hex 64`. Rotate annually or on suspected compromise.

## Klaviyo (W3 — empty in W1)

`NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY`
6-char alphanumeric Company ID. Safe to expose in client JS bundles (site-scoped).

`KLAVIYO_PRIVATE_API_KEY`
Server-only events key. Scopes: Events Full Access, Profiles Full Access. Get from Klaviyo → Settings → API Keys → Create Private API Key.

`KLAVIYO_NEWSLETTER_LIST_ID`
6-char code for the single **master subscriber list**. Every storefront signup (Lemna waitlist, Rebel Club, footer, quiz) joins this one list via `/api/klaviyo/subscribe`; the signup location is recorded as the `signup_source` profile property plus a per-source boolean flag (`mujo_protein_waitlist`, `rebel_club_member`, `quiz_completed`) so segments and flows are built on properties, not separate lists. The route falls back to `KLAVIYO_LEMNA_LIST_ID` if this is unset.

`KLAVIYO_LEMNA_LIST_ID` / `KLAVIYO_LEMNA_FORM_ID`
6-char codes for the Lemna pre-launch list and embed form. Found in Klaviyo dashboard URLs. `KLAVIYO_LEMNA_LIST_ID` doubles as the master-list fallback (see above).

> **Deprecated:** `NEXT_PUBLIC_KLAVIYO_QUIZ_LIST_ID` is no longer used. The homepage/Ritual quiz previously posted client-side to a separate quiz list; it now routes through `/api/klaviyo/subscribe` onto the master list and fires a `Completed Quiz` event. Do not reintroduce it.

`KLAVIYO_GIFT_RECIPIENT_LIST_ID`
6-char code for the "Gift Recipients" Klaviyo list. Used by `/api/account/subscription/send-gift`: when a customer sends a gift, the recipient's email gets added to this list IF they're not already in any Mujo list (dedupe avoids spamming returning customers). Profile properties attached: `gifted_by_email`, `gifted_product`, `gifted_at`, `gift_message`. Powers a "How was your gift?" follow-up flow built on the Klaviyo side. Set up: create a list named "Gift Recipients" in Klaviyo, copy its 6-char ID from the dashboard URL into this var. Without this var the gift route still works (PI succeeds, Shopify order ships) — just no recipient capture.

## Meta (W3 — empty in W1)

`NEXT_PUBLIC_META_PIXEL_ID`
15–16 digit Meta Pixel ID. Public — visible in any page source.

`META_CONVERSIONS_API_TOKEN`
Server-only token for Meta's Conversions API (server-side pixel events with deduplication). Get from Meta Events Manager → Settings → Conversions API → Generate access token.

## Loox (reviews widget)

`NEXT_PUBLIC_LOOX_SHOP_DOMAIN`
The store's myshopify domain (`get-mujo.myshopify.com`). Loox's external-domain (headless) review widgets key off this — no API key required. Loox is installed on the Shopify backend (Convert plan, which unlocks external-domain display + the Klaviyo integration). Widgets render on the PDPs via `lib/loox.ts` + `components/imported-page-runtime.tsx`. See `docs/loox-reviews.md`.

## App config

`NEXT_PUBLIC_SITE_URL`
Customer-facing site URL — used for canonical links, Open Graph, sitemap. Three values across environments:
- **Development**: `http://localhost:3000`
- **Preview / Production (W1+W2)**: `https://mujo-storefront.vercel.app`
- **Production at W3 cutover**: `https://mujoworld.com`

`NODE_ENV`
Vercel sets this automatically. Don't override.

`COMPANY_NAME` / `SITE_NAME`
Vercel Commerce template UI strings. Set to `Mujo Co.` and `Mujo Storefront`.

---

## Rotation cadence

| Var | Cadence | Trigger |
|---|---|---|
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | annually | suspected compromise |
| `SHOPIFY_ADMIN_API_ACCESS_TOKEN` | annually | suspected compromise (more sensitive) |
| `STRIPE_SECRET_KEY` | never (rotates only on Stripe-side compromise) | Stripe alert |
| `STRIPE_WEBHOOK_SECRET` | only if endpoint URL changes | endpoint move |
| `MAGIC_LINK_SECRET` | annually | suspected compromise |
| `MUJO_SESSION_SECRET` | annually | suspected compromise (rotating logs everyone out — coordinate) |
| `EMAIL_CHANGE_SECRET` | annually | suspected compromise |
| `SHOPIFY_REVALIDATION_SECRET` | quarterly | routine hygiene |
| All others | as-needed | API key compromise alerts |
