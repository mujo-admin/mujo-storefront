// scripts/mirror-shopify-to-stripe.ts
//
// One-time (re-runnable) script that mirrors Shopify products + variants into
// Stripe products + prices, and writes the resulting Stripe IDs back to Shopify
// as `mujo_commerce.stripe_product_id` (product) / `stripe_price_id_onetime`
// (variant) / `stripe_price_id_subscription` (variant if `is_subscribable=true`).
//
// Also creates two shipping rates ($0 over $50 / $5 flat under $50) and prints
// the IDs for adding to .env.local.
//
// Usage:
//   pnpm tsx --env-file=.env.local scripts/mirror-shopify-to-stripe.ts
//
// Prereqs (from Handoff #6 + #8):
//   - STRIPE_SECRET_KEY in env
//   - SHOPIFY_ADMIN_API_ACCESS_TOKEN in env (deferred from W1; needs the
//     Headless channel's Admin token or a Dev Dashboard custom-distribution OAuth)
//   - mujo_commerce.is_subscribable metafield = true on Mujo Ritual product
//
// Idempotent: re-runs update existing Stripe products/prices instead of
// creating duplicates. Stripe Prices are immutable, so if a Shopify variant
// price changes, the script archives the old Stripe Price and creates a new
// one — and writes the new ID back to the metafield.

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import Stripe from 'stripe';
import {
  listProductsForMirror,
  type ShopifyProductForMirror,
} from '../lib/shopify-admin';
import {
  setStripeProductIdOnProduct,
  setStripePriceIdOnetimeOnVariant,
  setStripePriceIdSubscriptionOnVariant,
} from '../lib/metafields';

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('STRIPE_SECRET_KEY not set');
  process.exit(1);
}
const hasStaticAdminToken = Boolean(process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN);
const hasAdminOAuth = Boolean(
  process.env.SHOPIFY_ADMIN_CLIENT_ID && process.env.SHOPIFY_ADMIN_CLIENT_SECRET,
);
if (!hasStaticAdminToken && !hasAdminOAuth) {
  console.error(
    'Shopify Admin auth not configured. Set either SHOPIFY_ADMIN_API_ACCESS_TOKEN ' +
      '(legacy static) or SHOPIFY_ADMIN_CLIENT_ID + SHOPIFY_ADMIN_CLIENT_SECRET (OAuth).',
  );
  process.exit(1);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const SUB_INTERVAL: Stripe.PriceCreateParams.Recurring.Interval = 'month';
const SUB_INTERVAL_COUNT = 1;
const FREE_SHIPPING_THRESHOLD_CENTS = 5000;

// Stripe tax_code by Shopify handle. Powdered drink mix → 1% IL grocery rate
// per project_stripe_tax_and_portal memory. Apparel → txcd_30070001 (clothing,
// taxable in most states, exempt in MN/NJ/PA/VT under thresholds). Frother →
// general (txcd_99999999). Lemna will need its own snack-foods code at launch.
const TAX_CODE_BY_HANDLE: Record<string, string> = {
  'the-ritual': 'txcd_41054002',
  'vitality-brew': 'txcd_41054002',
  'mujo-t-shirt': 'txcd_30070001',
  'mujo-baseball-hat': 'txcd_30070001',
  'crew-neck-sweatshirt': 'txcd_30070001',
  'electric-frother': 'txcd_99999999',
};
const DEFAULT_TAX_CODE = 'txcd_99999999';

// --- Helpers ---------------------------------------------------------------

function shopifyVariantGidToNumeric(gid: string): string {
  // gid://shopify/ProductVariant/123 → 123
  return gid.split('/').pop() ?? gid;
}

async function findStripeProduct(productId: string): Promise<Stripe.Product | null> {
  try {
    return await stripe.products.retrieve(productId);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError && err.code === 'resource_missing') {
      return null;
    }
    throw err;
  }
}

async function upsertStripeProduct(
  product: ShopifyProductForMirror,
): Promise<Stripe.Product> {
  const description = product.description.slice(0, 500) || undefined;
  const images = product.featuredImage ? [product.featuredImage.url] : [];
  const taxCode = TAX_CODE_BY_HANDLE[product.handle] ?? DEFAULT_TAX_CODE;

  if (product.stripeProductId) {
    const existing = await findStripeProduct(product.stripeProductId);
    if (existing) {
      const updated = await stripe.products.update(product.stripeProductId, {
        name: product.title,
        description,
        images,
        active: product.status === 'ACTIVE',
        tax_code: taxCode,
        metadata: { shopify_product_id: product.id, shopify_handle: product.handle },
      });
      console.log(`  ✓ Updated Stripe Product: ${updated.id} (tax_code ${taxCode})`);
      return updated;
    }
    console.log(
      `  ⚠ Stripe Product ${product.stripeProductId} from metafield no longer exists; creating new`,
    );
  }

  const created = await stripe.products.create({
    name: product.title,
    description,
    images,
    active: product.status === 'ACTIVE',
    tax_code: taxCode,
    metadata: { shopify_product_id: product.id, shopify_handle: product.handle },
  });
  console.log(`  ✓ Created Stripe Product: ${created.id} (tax_code ${taxCode})`);
  await setStripeProductIdOnProduct(product.id, created.id);
  return created;
}

async function findActivePrice(args: {
  productId: string;
  unitAmount: number;
  recurring: boolean;
  shopifyVariantGid: string;
}): Promise<Stripe.Price | null> {
  const list = await stripe.prices.list({
    product: args.productId,
    active: true,
    limit: 100,
  });
  return (
    list.data.find(
      (p) =>
        p.unit_amount === args.unitAmount &&
        p.currency === 'usd' &&
        Boolean(p.recurring) === args.recurring &&
        (!args.recurring ||
          (p.recurring?.interval === SUB_INTERVAL &&
            p.recurring?.interval_count === SUB_INTERVAL_COUNT)) &&
        // Disambiguate by variant — merch products have multiple variants
        // sharing the same unit_amount (e.g. all Crew sizes = $40). Matching
        // on amount alone returns the wrong Price for variants 2+.
        p.metadata.shopify_variant_id === args.shopifyVariantGid,
    ) ?? null
  );
}

async function upsertStripePrice(args: {
  product: Stripe.Product;
  shopifyVariantGid: string;
  shopifyVariantPrice: string; // e.g., "65.00"
  recurring: boolean;
  existingPriceId: string | null;
}): Promise<Stripe.Price> {
  const cents = Math.round(parseFloat(args.shopifyVariantPrice) * 100);

  // Stripe Prices are immutable. If existing matches amount + recurring + variant, reuse.
  if (args.existingPriceId) {
    try {
      const existing = await stripe.prices.retrieve(args.existingPriceId);
      const recurringMatch =
        Boolean(existing.recurring) === args.recurring &&
        (!args.recurring ||
          (existing.recurring?.interval === SUB_INTERVAL &&
            existing.recurring?.interval_count === SUB_INTERVAL_COUNT));
      const variantMatch =
        existing.metadata.shopify_variant_id === args.shopifyVariantGid;
      if (
        existing.active &&
        existing.unit_amount === cents &&
        recurringMatch &&
        variantMatch
      ) {
        return existing;
      }
      // If the variant_id doesn't match, this metafield points at a *different*
      // variant's Price (legacy from a buggy mirror run that returned the first
      // variant's Price for every subsequent variant of the same product). Don't
      // archive — it still belongs to that other variant. Just fall through and
      // create a fresh Price for this variant; the metafield gets overwritten
      // with the new ID by the caller.
      if (!variantMatch) {
        console.log(
          `  ⚠ Metafield pointed at ${existing.id} (variant=${existing.metadata.shopify_variant_id ?? 'unset'}); creating fresh Price for this variant`,
        );
      } else {
        // Amount or recurring shape drifted — archive old, create new.
        console.log(
          `  ⚠ Price drift on ${existing.id} (had ${existing.unit_amount}, want ${cents}); archiving and recreating`,
        );
        await stripe.prices.update(existing.id, { active: false });
      }
    } catch (err) {
      if (
        !(err instanceof Stripe.errors.StripeError && err.code === 'resource_missing')
      ) {
        throw err;
      }
    }
  } else {
    // Try to find an existing matching price before creating (handles partial-success runs)
    const found = await findActivePrice({
      productId: args.product.id,
      unitAmount: cents,
      recurring: args.recurring,
      shopifyVariantGid: args.shopifyVariantGid,
    });
    if (found) return found;
  }

  const params: Stripe.PriceCreateParams = {
    product: args.product.id,
    unit_amount: cents,
    currency: 'usd',
    metadata: { shopify_variant_id: args.shopifyVariantGid },
    ...(args.recurring && {
      recurring: {
        interval: SUB_INTERVAL,
        interval_count: SUB_INTERVAL_COUNT,
      },
    }),
  };
  const created = await stripe.prices.create(params);
  console.log(
    `  ✓ Created Stripe Price: ${created.id} (${cents}¢ ${args.recurring ? 'monthly' : 'one-time'})`,
  );
  return created;
}

async function findOrCreateShippingRate(args: {
  displayName: string;
  amountCents: number;
  freeShippingMinCents?: number;
}): Promise<Stripe.ShippingRate> {
  const list = await stripe.shippingRates.list({ active: true, limit: 100 });
  const existing = list.data.find(
    (r) =>
      r.display_name === args.displayName &&
      r.fixed_amount?.amount === args.amountCents &&
      r.fixed_amount?.currency === 'usd',
  );
  if (existing) return existing;

  const created = await stripe.shippingRates.create({
    display_name: args.displayName,
    type: 'fixed_amount',
    fixed_amount: { amount: args.amountCents, currency: 'usd' },
    delivery_estimate: {
      minimum: { unit: 'business_day', value: 3 },
      maximum: { unit: 'business_day', value: 7 },
    },
    metadata: args.freeShippingMinCents
      ? { free_shipping_min_cents: String(args.freeShippingMinCents) }
      : {},
  });
  console.log(`  ✓ Created shipping rate: ${created.id} (${args.displayName})`);
  return created;
}

// --- Main ------------------------------------------------------------------

async function main() {
  console.log('Listing Shopify products…');
  const products = await listProductsForMirror();
  console.log(`Found ${products.length} products in Shopify\n`);

  for (const product of products) {
    console.log(`\n→ ${product.title} (${product.handle})`);

    if (product.status !== 'ACTIVE') {
      console.log('  (skipping — product status is not ACTIVE)');
      continue;
    }

    const stripeProduct = await upsertStripeProduct(product);

    for (const variant of product.variants) {
      console.log(`  Variant: ${variant.title} (${variant.sku ?? 'no sku'}) — $${variant.price}`);

      const onetimePrice = await upsertStripePrice({
        product: stripeProduct,
        shopifyVariantGid: variant.id,
        shopifyVariantPrice: variant.price,
        recurring: false,
        existingPriceId: variant.stripePriceIdOnetime,
      });
      if (onetimePrice.id !== variant.stripePriceIdOnetime) {
        await setStripePriceIdOnetimeOnVariant(variant.id, onetimePrice.id);
      }

      if (product.isSubscribable) {
        const subPrice = await upsertStripePrice({
          product: stripeProduct,
          shopifyVariantGid: variant.id,
          shopifyVariantPrice: variant.price, // mirror at variant price; offers/discounts via Stripe coupons
          recurring: true,
          existingPriceId: variant.stripePriceIdSubscription,
        });
        if (subPrice.id !== variant.stripePriceIdSubscription) {
          await setStripePriceIdSubscriptionOnVariant(variant.id, subPrice.id);
        }
      }
    }
  }

  console.log('\nProducts + prices mirrored.\n');
  console.log('Creating shipping rates…');
  const free = await findOrCreateShippingRate({
    displayName: 'Free shipping (orders $50+)',
    amountCents: 0,
    freeShippingMinCents: FREE_SHIPPING_THRESHOLD_CENTS,
  });
  const flat = await findOrCreateShippingRate({
    displayName: 'Standard shipping',
    amountCents: 500,
  });

  console.log('\n=== Add to .env.local + Vercel env vars ===');
  console.log(`STRIPE_SHIPPING_FREE_ID=${free.id}`);
  console.log(`STRIPE_SHIPPING_FLAT_ID=${flat.id}`);
  console.log('===========================================');
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Mirror failed:', err);
  process.exit(1);
});
