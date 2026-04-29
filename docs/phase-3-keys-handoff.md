# Phase 3 keys — Vercel env handoff

> Drop these into Vercel Production scope before the DNS cutover. All integrations silently no-op if env vars are missing — staging works fine without them — but Klaviyo capture, Meta Pixel + CAPI, and Okendo reviews need them to fire on real traffic.

---

## Where to find each key

| Env var | Where in Klaviyo / Meta / Okendo |
|---|---|
| `NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY` | Klaviyo → Account → Settings → API Keys → **Public API Key** (6-char alphanumeric) |
| `KLAVIYO_PRIVATE_KEY` | Klaviyo → Account → Settings → API Keys → **Create Private API Key** with full read/write scope |
| `KLAVIYO_LIST_ID_LEMNA_WAITLIST` | Klaviyo → Lists & Segments → existing or new list → URL contains the list ID |
| `KLAVIYO_LIST_ID_AMBASSADOR_APPLICATIONS` | Same — create list "Ambassador applications" if needed |
| `KLAVIYO_LIST_ID_CONTACT_FORM` | Same — create list "Contact form" if needed |
| `KLAVIYO_LIST_ID_JOURNAL_NEWSLETTER` | Same — create list "Journal newsletter" if needed |
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta → Events Manager → Data Sources → Pixel → Pixel ID (15-digit) |
| `META_CAPI_TOKEN` | Meta → Events Manager → Pixel → Settings → Generate Conversions API Access Token |
| `META_CAPI_TEST_EVENT_CODE` | Meta → Events Manager → Test Events → Test event code. **Keep ONLY in Preview env, NOT Production.** Used during Phase 5 verification only. |
| `NEXT_PUBLIC_OKENDO_API_KEY` | Okendo Dashboard → Settings → API → Public Key. Optional — placeholder ships if absent. |
| `RESEND_API_KEY` | Already configured from W2. Used by `/api/contact` to email kinga@mujoworld.com. Confirm it's in Production. |

---

## Add to Vercel via CLI

From the storefront repo:

```sh
cd ~/Documents/Mujo\ AI/mujo-storefront

# Public keys (visible to client) — add to Production AND Preview
vercel env add NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY production
vercel env add NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY preview
vercel env add NEXT_PUBLIC_META_PIXEL_ID production
vercel env add NEXT_PUBLIC_META_PIXEL_ID preview
vercel env add NEXT_PUBLIC_OKENDO_API_KEY production  # optional
vercel env add NEXT_PUBLIC_OKENDO_API_KEY preview     # optional

# Private keys (server only) — add to Production
vercel env add KLAVIYO_PRIVATE_KEY production
vercel env add META_CAPI_TOKEN production

# List IDs — add to Production
vercel env add KLAVIYO_LIST_ID_LEMNA_WAITLIST production
vercel env add KLAVIYO_LIST_ID_AMBASSADOR_APPLICATIONS production
vercel env add KLAVIYO_LIST_ID_CONTACT_FORM production
vercel env add KLAVIYO_LIST_ID_JOURNAL_NEWSLETTER production

# Test event code — Preview ONLY (not Production)
vercel env add META_CAPI_TEST_EVENT_CODE preview

# Re-deploy to pick them up
vercel deploy --prod --token "$(grep -oE 'vcp_[A-Za-z0-9]+' ~/.vercel-token | head -1)" --yes
```

Or add via Vercel dashboard: Project → Settings → Environment Variables → Add. Same envs.

---

## Verify the wiring after deploy

1. **Klaviyo sign-up flow** — submit any waitlist or contact form. Check Klaviyo Activity Feed for the matching event + profile in the right list.
2. **Meta Pixel** — install Meta Pixel Helper Chrome extension, visit any route, confirm green PageView.
3. **Meta CAPI** — Events Manager → Test Events → enter `META_CAPI_TEST_EVENT_CODE` from Preview. Trigger a checkout flow on a Preview deploy. Confirm paired client + server `InitiateCheckout` events with matching `event_id`.
4. **Klaviyo Started Checkout** — POST to `/api/checkout` (with `customer_email` in payload) → confirm event in Klaviyo Activity Feed.
5. **Okendo** — visit `/products/mujo-ritual`. If key configured, real reviews widget; if absent, "Reviews coming soon" placeholder.

---

## Production env vars checklist

Mark each as you add:

- [ ] `NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY`
- [ ] `KLAVIYO_PRIVATE_KEY`
- [ ] `KLAVIYO_LIST_ID_LEMNA_WAITLIST`
- [ ] `KLAVIYO_LIST_ID_AMBASSADOR_APPLICATIONS`
- [ ] `KLAVIYO_LIST_ID_CONTACT_FORM`
- [ ] `KLAVIYO_LIST_ID_JOURNAL_NEWSLETTER`
- [ ] `NEXT_PUBLIC_META_PIXEL_ID`
- [ ] `META_CAPI_TOKEN`
- [ ] `NEXT_PUBLIC_OKENDO_API_KEY` (optional)
- [ ] `RESEND_API_KEY` (carry-over from W2 — verify present)

When all checked, redeploy. Integrations activate on the next request.
