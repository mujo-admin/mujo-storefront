#!/bin/bash
# Push selected W2 env vars from .env.local to Vercel (production scope).
# Idempotent: removes existing var, then re-adds. Silent on rm failure (var didn't exist).
#
# Usage: ./scripts/vercel-env-push.sh
# Prereq: .env.local populated, ~/.vercel-token exists, vercel CLI installed.

set -e
cd "$(dirname "$0")/.."

TOKEN_FILE="$HOME/.vercel-token"
if [ ! -f "$TOKEN_FILE" ]; then
  echo "ERROR: ~/.vercel-token not found. Generate at https://vercel.com/account/tokens"
  exit 1
fi
# File content may be either the raw token, or VERCEL_TOKEN=value (key=value form).
RAW="$(cat "$TOKEN_FILE" | tr -d '\n\r')"
if [[ "$RAW" == VERCEL_TOKEN=* ]]; then
  TOKEN="${RAW#VERCEL_TOKEN=}"
else
  TOKEN="$RAW"
fi

# Vars to sync. Each gets removed (silent fail if absent) then re-added with the
# value from .env.local. Production scope only — Preview/Development can be
# added by re-running with VERCEL_ENV=preview etc.
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
  NEXT_PUBLIC_META_PIXEL_ID
  META_CONVERSIONS_API_TOKEN
  # META_TEST_EVENT_CODE intentionally NOT pushed to production —
  # auto-included only when NODE_ENV !== production by lib/meta-capi.ts
)

ENV_SCOPE="${VERCEL_ENV:-production}"

echo "→ Syncing ${#VARS[@]} env vars to Vercel ($ENV_SCOPE scope)…"
echo

for VAR in "${VARS[@]}"; do
  VALUE=$(grep -E "^${VAR}=" .env.local | head -1 | cut -d= -f2- | sed 's/^"\(.*\)"$/\1/')
  if [ -z "$VALUE" ]; then
    echo "  ↷ $VAR (skipped — empty in .env.local)"
    continue
  fi

  # Remove existing (ignore errors — may not exist yet)
  vercel env rm "$VAR" "$ENV_SCOPE" --yes --token "$TOKEN" >/dev/null 2>&1 || true

  # Add new value via stdin
  if echo "$VALUE" | vercel env add "$VAR" "$ENV_SCOPE" --token "$TOKEN" >/dev/null 2>&1; then
    echo "  ✓ $VAR"
  else
    echo "  ✗ $VAR (failed to add)"
  fi
done

echo
echo "Done. Trigger a redeploy to pick up new env vars:"
echo "  vercel --prod --token=\$(cat ~/.vercel-token)"
