import { MERCH_PRICE_IDS, type MerchPriceKey } from 'lib/stripe-constants';
import type { CartLineItem } from './types';

/**
 * Merch variant matrix for the 4 PDPs at /products/mujo-{frother,tee,hat,crew}.
 * Source of truth is Shopify (Phase 0 hygiene 2026-05-21 set inventory_policy
 * to CONTINUE on all merch variants, allowing oversell while POD/batch
 * fulfillment catches up).
 *
 * Asymmetric crew matrix: Bone has S/M/L/XL only (no XS). When Bone is the
 * active color, the runtime disables and strikes through the XS pill.
 *
 * HTML reconciliations queued for Phase 3.2 (Fri 2026-05-22):
 *   - Hat HTML has no color swatches; add White + Stone.
 *   - Tee HTML labels color "Sand"; Shopify calls it "Desert Dust". HTML follows Shopify.
 *   - Tee HTML has 5 size pills incl. XS; Shopify is S/M/L/XL only. Remove XS.
 *   - Crew HTML shows all 5 sizes for both colors; runtime disables Bone+XS.
 */

type MerchHandleSlug = 'mujo-frother' | 'mujo-tee' | 'mujo-hat' | 'mujo-crew';

/** Storefront route slug → Shopify product handle. Storefront preserves the
 *  marketing slug; Shopify keeps its operationally-meaningful handle so
 *  Admin links don't break. */
export const MERCH_HANDLE_MAP: Record<MerchHandleSlug, string> = {
  'mujo-frother': 'electric-frother',
  'mujo-tee': 'mujo-t-shirt',
  'mujo-hat': 'mujo-baseball-hat',
  'mujo-crew': 'crew-neck-sweatshirt',
};

export type MerchColor =
  | 'white'
  | 'stone'
  | 'desert'
  | 'bone'
  | 'sandstone';

export type MerchSize = 'xs' | 's' | 'm' | 'l' | 'xl';

/** Per-handle variant lookup. null = combination doesn't exist (asymmetric). */
type VariantMatrix = {
  [slug in MerchHandleSlug]: {
    colors: MerchColor[] | null; // null = no color dimension (e.g. frother)
    sizes: MerchSize[] | null;   // null = no size dimension (e.g. frother, hat)
    /** Returns the env-var-backed Price ID for a (color?, size?) combo. */
    priceKey: (color?: MerchColor, size?: MerchSize) => MerchPriceKey | null;
  };
};

export const MERCH_VARIANT_MATRIX: VariantMatrix = {
  'mujo-frother': {
    colors: null,
    sizes: null,
    priceKey: () => 'frother',
  },
  'mujo-hat': {
    colors: ['white', 'stone'],
    sizes: null,
    priceKey: (color) => {
      if (color === 'white') return 'hat_white';
      if (color === 'stone') return 'hat_stone';
      return null;
    },
  },
  'mujo-tee': {
    colors: ['desert', 'white'],
    sizes: ['s', 'm', 'l', 'xl'],
    priceKey: (color, size) => {
      if (!color || !size) return null;
      const key = `tee_${color}_${size}` as MerchPriceKey;
      return key in MERCH_PRICE_IDS ? key : null;
    },
  },
  'mujo-crew': {
    colors: ['bone', 'sandstone'],
    sizes: ['xs', 's', 'm', 'l', 'xl'],
    priceKey: (color, size) => {
      if (!color || !size) return null;
      // Bone has no XS — Shopify-side truth, see comment at top.
      if (color === 'bone' && size === 'xs') return null;
      const key = `crew_${color}_${size}` as MerchPriceKey;
      return key in MERCH_PRICE_IDS ? key : null;
    },
  },
};

/** Sizes available for a (slug, color) pair. Used by runtime to enable/strike
 *  size pills. Returns [] if the slug has no size dimension. */
export function availableSizesFor(
  slug: MerchHandleSlug,
  color?: MerchColor,
): MerchSize[] {
  const matrix = MERCH_VARIANT_MATRIX[slug];
  if (!matrix.sizes) return [];
  return matrix.sizes.filter(
    (size) => matrix.priceKey(color, size) !== null,
  );
}

// --- Cart line resolution -------------------------------------------------

type PriceIdResolution = Pick<
  CartLineItem,
  | 'productHandle'
  | 'productTitle'
  | 'variantTitle'
  | 'image'
  | 'unitAmountCents'
  | 'currency'
  | 'isSubscription'
>;

// Image paths point at slots in public/images/products/. If a file is missing
// the cart drawer falls back to /og-default.png — Phase 4 imagery sprint
// (apparel /batch-produce) populates the real shots.
const MERCH_IMAGES: Record<MerchHandleSlug, { url: string; alt: string }> = {
  'mujo-frother': {
    url: '/images/products/mujo-frother.webp',
    alt: 'Matte black electric milk frother',
  },
  'mujo-hat': {
    url: '/images/products/mujo-hat.webp',
    alt: 'Mujo baseball hat with embroidered mark',
  },
  'mujo-tee': {
    url: '/images/products/mujo-tee.webp',
    alt: 'Mujo cotton tee with embroidered wordmark',
  },
  'mujo-crew': {
    url: '/images/products/mujo-crew.webp',
    alt: 'Mujo crew neck sweatshirt',
  },
};

const MERCH_TITLES: Record<MerchHandleSlug, string> = {
  'mujo-frother': 'Electric Frother',
  'mujo-hat': 'Baseball Hat',
  'mujo-tee': 'Mujo Tee',
  'mujo-crew': 'Crew Neck',
};

const MERCH_PRICES_CENTS: Record<MerchHandleSlug, number> = {
  'mujo-frother': 2000,
  'mujo-hat': 2500,
  'mujo-tee': 3000,
  'mujo-crew': 4000,
};

const COLOR_LABELS: Record<MerchColor, string> = {
  white: 'White',
  stone: 'Stone',
  desert: 'Desert Dust',
  bone: 'Bone',
  sandstone: 'Sandstone',
};

const SIZE_LABELS: Record<MerchSize, string> = {
  xs: 'XS',
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL',
};

function variantTitle(color?: MerchColor, size?: MerchSize): string {
  const parts: string[] = [];
  if (color) parts.push(COLOR_LABELS[color]);
  if (size) parts.push(SIZE_LABELS[size]);
  parts.push('One-time');
  return parts.join(' · ');
}

/** Reverse-lookup: given a Stripe Price ID, return cart-line metadata.
 *  Mirrors RITUAL_LINES; falls through to null if the Price ID isn't merch. */
export function resolveMerchPriceId(stripePriceId: string): PriceIdResolution | null {
  for (const [slug, matrix] of Object.entries(MERCH_VARIANT_MATRIX) as Array<
    [MerchHandleSlug, VariantMatrix[MerchHandleSlug]]
  >) {
    // Walk all (color, size) combos for this slug, find matching Price ID.
    const colors = matrix.colors ?? [undefined as unknown as MerchColor];
    const sizes = matrix.sizes ?? [undefined as unknown as MerchSize];
    for (const color of colors) {
      for (const size of sizes) {
        const key = matrix.priceKey(color, size);
        if (!key) continue;
        if (MERCH_PRICE_IDS[key] === stripePriceId) {
          return {
            productHandle: slug,
            productTitle: MERCH_TITLES[slug],
            variantTitle: variantTitle(color, size),
            image: MERCH_IMAGES[slug],
            unitAmountCents: MERCH_PRICES_CENTS[slug],
            currency: 'usd',
            isSubscription: false,
          };
        }
      }
    }
  }
  return null;
}

/** Forward resolution from PDP selection state. Called by the merch cart
 *  handler in imported-page-runtime.tsx after reading .color-swatch.active
 *  and .size-pill.active from the DOM. */
export function resolveMerchSelection(
  slug: MerchHandleSlug,
  color?: MerchColor,
  size?: MerchSize,
): { stripePriceId: string; line: PriceIdResolution } | null {
  const matrix = MERCH_VARIANT_MATRIX[slug];
  const key = matrix.priceKey(color, size);
  if (!key) return null;
  const stripePriceId = MERCH_PRICE_IDS[key];
  if (!stripePriceId) return null; // Price not yet mirrored to Stripe / env var unset
  return {
    stripePriceId,
    line: {
      productHandle: slug,
      productTitle: MERCH_TITLES[slug],
      variantTitle: variantTitle(color, size),
      image: MERCH_IMAGES[slug],
      unitAmountCents: MERCH_PRICES_CENTS[slug],
      currency: 'usd',
      isSubscription: false,
    },
  };
}
