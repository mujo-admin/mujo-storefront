import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });
import Stripe from 'stripe';
import { adminFetch } from '../lib/shopify-admin';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '');

type ProductInfo = { stripeProductId: string; shopifyHandle: string };

const PRODUCT_BY_SLUG: Record<string, ProductInfo> = {
  'mujo-frother': { stripeProductId: 'prod_UPHeADdMvM1bNt', shopifyHandle: 'electric-frother' },
  'mujo-hat':     { stripeProductId: 'prod_UPHe2BrMlQTPgB', shopifyHandle: 'mujo-baseball-hat' },
  'mujo-tee':     { stripeProductId: 'prod_UPHeNMlNj7Xtk1', shopifyHandle: 'mujo-t-shirt' },
  'mujo-crew':    { stripeProductId: 'prod_UPHeSjOrsNskhP', shopifyHandle: 'crew-neck-sweatshirt' },
};

type VariantEdge = { node: { id: string; title: string } };
type VariantsResponse = {
  productByHandle: { variants: { edges: VariantEdge[] } } | null;
};

// Pull variant titles from Shopify per handle.
async function shopifyVariantsByHandle(handle: string): Promise<Record<string, string>> {
  const data = (await adminFetch({
    query: `
      query VariantsByHandle($handle: String!) {
        productByHandle(handle: $handle) {
          variants(first: 50) {
            edges { node { id title } }
          }
        }
      }
    `,
    variables: { handle },
  })) as VariantsResponse;
  const variants = data.productByHandle?.variants.edges.map((e) => e.node) ?? [];
  return Object.fromEntries(variants.map((v) => [v.id.split('/').pop() ?? '', v.title]));
}

// Convert a Shopify variant title to our env var slug.
// Frother: "Default Title" → 'FROTHER'
// Hat: "White / One size" → 'HAT_WHITE'
// Tee: "Desert Dust / M" → 'TEE_DESERT_M'
// Crew: "Bone / XL" → 'CREW_BONE_XL'
function envKeyFor(slug: string, variantTitle: string): string {
  if (slug === 'mujo-frother') return 'MERCH_FROTHER';
  const parts = variantTitle.split('/').map((s) => s.trim());
  const color = (parts[0] ?? '')
    .toUpperCase()
    .replace('DESERT DUST', 'DESERT')
    .replace(/\s+/g, '_');
  if (slug === 'mujo-hat') return `MERCH_HAT_${color}`;
  const size = (parts[1] ?? '').toUpperCase().replace(/\s+/g, '_');
  if (slug === 'mujo-tee')  return `MERCH_TEE_${color}_${size}`;
  if (slug === 'mujo-crew') return `MERCH_CREW_${color}_${size}`;
  throw new Error(`Unknown slug ${slug}`);
}

async function main() {
  const envLines: string[] = [];
  for (const [slug, { stripeProductId, shopifyHandle }] of Object.entries(PRODUCT_BY_SLUG)) {
    const variantTitles = await shopifyVariantsByHandle(shopifyHandle);
    const prices = await stripe.prices.list({ product: stripeProductId, active: true, limit: 100 });
    console.log(`\n${slug} — ${prices.data.length} Prices`);
    for (const p of prices.data) {
      const variantNumeric = p.metadata.shopify_variant_id?.split('/').pop() ?? '';
      const title = variantTitles[variantNumeric] || '(unknown variant)';
      const key = envKeyFor(slug, title);
      console.log(`  ${title.padEnd(28)}  ${p.id}  → NEXT_PUBLIC_${key}`);
      envLines.push(`NEXT_PUBLIC_${key}=${p.id}`);
    }
  }
  console.log('\n=== Paste into .env.local ===');
  console.log('# Merch Stripe Price IDs (Test mode) — captured 2026-05-21');
  envLines.sort();
  console.log(envLines.join('\n'));
}

main().catch((err) => { console.error(err); process.exit(1); });
