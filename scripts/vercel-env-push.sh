#!/bin/bash
# Push selected env vars from .env.local to Vercel (production scope) via the
# REST API directly. Uses the API instead of `vercel env add` because the CLI's
# stdin-pipe path stores values as empty strings on some Vercel CLI versions.
#
# Idempotent: deletes existing entries first, then re-creates with the value
# from .env.local. Production scope only — re-run with VERCEL_ENV=preview to
# target Preview.
#
# Usage: ./scripts/vercel-env-push.sh
# Prereq: .env.local populated, ~/.vercel-token exists, jq + curl available.

set -e
cd "$(dirname "$0")/.."

TOKEN_FILE="$HOME/.vercel-token"
if [ ! -f "$TOKEN_FILE" ]; then
  echo "ERROR: ~/.vercel-token not found. Generate at https://vercel.com/account/tokens"
  exit 1
fi

# Tolerate either raw token or `VERCEL_TOKEN=value` form
RAW="$(cat "$TOKEN_FILE" | tr -d '\n\r')"
if [[ "$RAW" == VERCEL_TOKEN=* ]]; then
  TOKEN="${RAW#VERCEL_TOKEN=}"
else
  TOKEN="$RAW"
fi

# Project + team IDs from .vercel/project.json (cached after `vercel link`)
TEAM=$(jq -r .orgId .vercel/project.json)
PROJECT=$(jq -r .projectId .vercel/project.json)
if [ -z "$TEAM" ] || [ -z "$PROJECT" ] || [ "$TEAM" = "null" ] || [ "$PROJECT" = "null" ]; then
  echo "ERROR: Could not read teamId/projectId from .vercel/project.json"
  exit 1
fi

# Vars to sync. Each gets removed (if present), then created with the value
# from .env.local via Vercel REST API. Production scope only.
VARS=(
  STRIPE_SECRET_KEY
  STRIPE_PUBLISHABLE_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_SHIPPING_FREE_ID
  STRIPE_SHIPPING_FLAT_ID
  SHOPIFY_ADMIN_CLIENT_ID
  SHOPIFY_ADMIN_CLIENT_SECRET
  SHOPIFY_ADMIN_API_VERSION
  RESEND_API_KEY
  RESEND_FROM_EMAIL
  MAGIC_LINK_SECRET
  # --- W3 (Klaviyo + Meta Pixel + CAPI + Okendo + site URL) ---
  NEXT_PUBLIC_KLAVIYO_PUBLIC_KEY
  KLAVIYO_PRIVATE_API_KEY
  KLAVIYO_NEWSLETTER_LIST_ID
  KLAVIYO_LEMNA_LIST_ID
  KLAVIYO_RITUAL_FORM_ID
  KLAVIYO_LEMNA_FORM_ID
  KLAVIYO_GIFT_RECIPIENT_LIST_ID
  NEXT_PUBLIC_META_PIXEL_ID
  META_CONVERSIONS_API_TOKEN
  # META_TEST_EVENT_CODE intentionally NOT pushed to production —
  # auto-included only when NODE_ENV !== production by lib/meta-capi.ts
  # --- Ritual PDP Stripe Price IDs (NEXT_PUBLIC for client buy box) ---
  NEXT_PUBLIC_RITUAL_PRICE_10_ONETIME
  NEXT_PUBLIC_RITUAL_PRICE_10_SUBSCRIPTION
  NEXT_PUBLIC_RITUAL_PRICE_25_ONETIME
  NEXT_PUBLIC_RITUAL_PRICE_25_SUBSCRIPTION
  # Subscription discount coupon (15% off, applied server-side in /api/checkout)
  STRIPE_SUBSCRIPTION_COUPON_ID
  # --- On-site checkout (2026-05-07 — phases 0-2 + Embedded Checkout pivot) ---
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY  # pk_test_… exposed to browser for loadStripe()
  MUJO_SESSION_SECRET                 # JWT signing for /account session cookie (Phase 3)
  EMAIL_CHANGE_SECRET                 # JWT signing for email-change token (Phase 5)
  NEXT_PUBLIC_ENABLE_EXPRESS_CHECKOUT # ECE flag (false on staging, true post-cutover)
  NEXT_PUBLIC_ENABLE_ON_SITE_CHECKOUT # legacy flag (vestigial post-pivot, kept for documentation)
)

ENV_SCOPE="${VERCEL_ENV:-production}"

# Fetch current env list once so we can resolve IDs for deletion
ENVS_JSON=$(curl -s "https://api.vercel.com/v10/projects/${PROJECT}/env?teamId=${TEAM}" \
  -H "Authorization: Bearer $TOKEN")

echo "→ Syncing ${#VARS[@]} env vars to Vercel ($ENV_SCOPE scope) via REST API…"
echo

for VAR in "${VARS[@]}"; do
  VALUE=$(grep -E "^${VAR}=" .env.local | head -1 | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/')
  if [ -z "$VALUE" ]; then
    echo "  ↷ $VAR (skipped — empty in .env.local)"
    continue
  fi

  # Delete any existing entry on this scope (silent if absent)
  ID=$(echo "$ENVS_JSON" | jq -r ".envs[]? | select(.key == \"$VAR\" and (.target | contains([\"$ENV_SCOPE\"]))) | .id" | head -1)
  if [ -n "$ID" ] && [ "$ID" != "null" ]; then
    curl -s -X DELETE "https://api.vercel.com/v9/projects/${PROJECT}/env/${ID}?teamId=${TEAM}" \
      -H "Authorization: Bearer $TOKEN" > /dev/null
  fi

  # Create new with explicit value via JSON body (jq escapes safely)
  PAYLOAD=$(jq -nc --arg key "$VAR" --arg value "$VALUE" --arg target "$ENV_SCOPE" \
    '{key: $key, value: $value, type: "encrypted", target: [$target]}')
  RESULT=$(curl -s -X POST "https://api.vercel.com/v10/projects/${PROJECT}/env?teamId=${TEAM}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD")

  ERR=$(echo "$RESULT" | jq -r '.error.message // empty')
  if [ -n "$ERR" ]; then
    echo "  ✗ $VAR ($ERR)"
  else
    echo "  ✓ $VAR"
  fi
done

echo
echo "Done. Trigger a redeploy to pick up new env vars:"
echo "  TOKEN=\$(grep -oE 'vcp_[A-Za-z0-9]+' ~/.vercel-token | head -1) vercel deploy --prod --token \"\$TOKEN\" --yes"
