// Typed read/write helpers for the `mujo_commerce` metafield namespace.
// See docs/metafields.md for the full spec.

import { adminFetch, ShopifyAdminError } from './shopify-admin';

export const NAMESPACE = 'mujo_commerce';

// --- Keys (single source of truth) -----------------------------------------

export const KEYS = {
  // Product-level
  stripeProductId: 'stripe_product_id',
  isSubscribable: 'is_subscribable',
  // Variant-level
  stripePriceIdOnetime: 'stripe_price_id_onetime',
  stripePriceIdSubscription: 'stripe_price_id_subscription',
  // Customer-level
  stripeCustomerId: 'stripe_customer_id',
  subscriptionStatus: 'subscription_status',
  currentPeriodEnd: 'current_period_end',
} as const;

export type MetafieldOwnerType =
  | 'PRODUCT'
  | 'PRODUCTVARIANT'
  | 'CUSTOMER'
  | 'ORDER';

export type MetafieldType =
  | 'single_line_text_field'
  | 'boolean'
  | 'date'
  | 'json';

// --- Generic write ----------------------------------------------------------

export async function setMetafield(input: {
  ownerId: string; // Shopify GID
  key: string;
  value: string;
  type: MetafieldType;
  namespace?: string;
}): Promise<void> {
  const namespace = input.namespace ?? NAMESPACE;
  const data = await adminFetch<{
    metafieldsSet: {
      metafields: Array<{ id: string }>;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>({
    query: /* GraphQL */ `
      mutation SetMetafield($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }
    `,
    variables: {
      metafields: [
        {
          ownerId: input.ownerId,
          namespace,
          key: input.key,
          type: input.type,
          value: input.value,
        },
      ],
    },
  });

  if (data.metafieldsSet.userErrors.length) {
    throw new ShopifyAdminError(
      `metafieldsSet failed for ${input.key}`,
      data.metafieldsSet.userErrors,
    );
  }
}

// --- Typed convenience wrappers --------------------------------------------

export const setStripeProductIdOnProduct = (productGid: string, stripeProductId: string) =>
  setMetafield({
    ownerId: productGid,
    key: KEYS.stripeProductId,
    value: stripeProductId,
    type: 'single_line_text_field',
  });

export const setStripePriceIdOnetimeOnVariant = (variantGid: string, stripePriceId: string) =>
  setMetafield({
    ownerId: variantGid,
    key: KEYS.stripePriceIdOnetime,
    value: stripePriceId,
    type: 'single_line_text_field',
  });

export const setStripePriceIdSubscriptionOnVariant = (
  variantGid: string,
  stripePriceId: string,
) =>
  setMetafield({
    ownerId: variantGid,
    key: KEYS.stripePriceIdSubscription,
    value: stripePriceId,
    type: 'single_line_text_field',
  });

export const setStripeCustomerIdOnCustomer = (customerGid: string, stripeCustomerId: string) =>
  setMetafield({
    ownerId: customerGid,
    key: KEYS.stripeCustomerId,
    value: stripeCustomerId,
    type: 'single_line_text_field',
  });

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'paused'
  | 'trialing'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired';

export const setSubscriptionStatusOnCustomer = (
  customerGid: string,
  status: SubscriptionStatus,
) =>
  setMetafield({
    ownerId: customerGid,
    key: KEYS.subscriptionStatus,
    value: status,
    type: 'single_line_text_field',
  });

export const setCurrentPeriodEndOnCustomer = (customerGid: string, endDateIso: string) =>
  setMetafield({
    ownerId: customerGid,
    key: KEYS.currentPeriodEnd,
    // Shopify's `date` type expects YYYY-MM-DD
    value: endDateIso.slice(0, 10),
    type: 'date',
  });
