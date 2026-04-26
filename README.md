# Mujo Storefront

Headless Next.js 15 storefront for [Mujo Co.](https://mujoworld.com) — adaptogenic mushroom drinks and (incoming) Lemna protein bars. Forked from [vercel/commerce](https://github.com/vercel/commerce).

**Status:** W1 shipped 2026-04-26. Catalog renders from Shopify Storefront API at <https://mujo-storefront.vercel.app>. W2 (Stripe commerce platform) and W3 (Mujo Ritual landing page port + Lemna page + DNS cutover) follow.

---

## Local development

Requires Node 20 (see `.nvmrc`), pnpm 10, and a populated `.env.local`.

```bash
pnpm install
pnpm dev
```

Visit <http://localhost:3000>. Routes that work today:

- `/search` — full product catalog
- `/product/the-ritual` — flagship PDP
- `/product/vitality-brew` — legacy product PDP

Homepage carousel is empty pending W3's Mujo Ritual v4 HTML port; routes above are the W1 smoke test surface.

---

## Deploying to Vercel

Already linked. Push to `main` triggers an auto-deploy. Manual:

```bash
vercel --prod
```

Pull production env vars locally:

```bash
vercel env pull .env.local
```

---

## Environment variables

See [`docs/env-vars.md`](./docs/env-vars.md) for the full reference. Quick summary:

| Var | What | Required for |
|---|---|---|
| `SHOPIFY_STORE_DOMAIN` | `get-mujo.myshopify.com` | W1 |
| `SHOPIFY_STOREFRONT_ACCESS_TOKEN` | Public token from Headless channel | W1 |
| `SHOPIFY_REVALIDATION_SECRET` | Random hex | W1 |
| `POSTGRES_*` | Auto-injected by Vercel Postgres integration | W1 (empty schema), W2 (populated) |
| `STRIPE_*` | Stripe keys + webhook secret | W2 |
| `RESEND_API_KEY` | Magic-link emails | W2 |
| `KLAVIYO_*` / `META_*` / `OKENDO_*` | Marketing instrumentation | W3 |

---

## Architecture

See [`docs/architecture.md`](./docs/architecture.md). One-line summary: **Shopify owns catalog + inventory + orders. Stripe owns checkout + subscriptions. Postgres caches subscription state. Next.js renders the UX.**

---

## Plans

This repo's roadmap is captured in three implementation plans in the AIOS workspace at `~/Documents/Mujo AI/aios-starter-kit/plans/`:

- [`2026-04-21-headless-w1-infrastructure.md`](../aios-starter-kit/plans/2026-04-21-headless-w1-infrastructure.md) — **Status: Implemented**
- [`2026-04-21-headless-w2-stripe-commerce-platform.md`](../aios-starter-kit/plans/2026-04-21-headless-w2-stripe-commerce-platform.md) — Status: Draft
- [`2026-04-21-headless-w3-mujo-ritual-v4-lemna-port.md`](../aios-starter-kit/plans/2026-04-21-headless-w3-mujo-ritual-v4-lemna-port.md) — Status: Draft
- [`2026-04-21-headless-handoffs.md`](../aios-starter-kit/plans/2026-04-21-headless-handoffs.md) — Per-handoff playbook

---

## License

Forked from [vercel/commerce](https://github.com/vercel/commerce) under [MIT](./license.md). Mujo-specific changes are © 2026 Mujo Co.
