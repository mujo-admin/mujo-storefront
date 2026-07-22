// Shopify Admin API GraphQL client. Separate from lib/shopify (Storefront API)
// because Admin uses a different endpoint, different auth header, and writes
// orders/customers/metafields that the storefront read-side never touches.
//
// Auth: supports both legacy static tokens AND OAuth Client Credentials.
// - If SHOPIFY_ADMIN_API_ACCESS_TOKEN is set → use it directly (legacy path)
// - Else if SHOPIFY_ADMIN_CLIENT_ID + SHOPIFY_ADMIN_CLIENT_SECRET are set →
//   exchange for a short-lived access token, cache in-memory until expiry,
//   refresh-on-401, single-flight via in-flight promise to avoid stampedes
//
// Static custom-app tokens were deprecated by Shopify on 2026-01-01. Stores
// that already had Develop apps enabled may still issue static tokens to
// existing apps, but new app creation now goes through OAuth. The code below
// works either way without changes — Kinga reports back what Shopify gave us
// and the right env vars get populated in .env.local.

const ADMIN_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION ?? '2025-01';

function getAdminHost(): string {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) throw new Error('SHOPIFY_STORE_DOMAIN is not set');
  return domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function getAdminEndpoint(): string {
  return `https://${getAdminHost()}/admin/api/${ADMIN_API_VERSION}/graphql.json`;
}

// --- Token management -------------------------------------------------------

type CachedToken = { token: string; expiresAt: number };
let cachedToken: CachedToken | null = null;
let inflightExchange: Promise<CachedToken> | null = null;

const TOKEN_REFRESH_BUFFER_MS = 60_000; // refresh 60s before expiry

async function exchangeClientCredentials(): Promise<CachedToken> {
  const clientId = process.env.SHOPIFY_ADMIN_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_ADMIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'Shopify Admin auth not configured: set either SHOPIFY_ADMIN_API_ACCESS_TOKEN (legacy static) ' +
        'or SHOPIFY_ADMIN_CLIENT_ID + SHOPIFY_ADMIN_CLIENT_SECRET (OAuth Client Credentials).',
    );
  }

  const res = await fetch(`https://${getAdminHost()}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify OAuth token exchange failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }

  const body = (await res.json()) as {
    access_token: string;
    expires_in?: number; // seconds
    scope?: string;
  };

  if (!body.access_token) {
    throw new Error('Shopify OAuth response missing access_token');
  }

  // Default to 1 hour if Shopify doesn't return expires_in (defensive — current
  // Client Credentials grants in early 2026 return ~3600s tokens).
  const ttlSec = body.expires_in ?? 3600;
  return {
    token: body.access_token,
    expiresAt: Date.now() + ttlSec * 1000,
  };
}

async function getAdminAccessToken(forceRefresh = false): Promise<string> {
  // Path 1: static token (legacy)
  const staticToken = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  if (staticToken) return staticToken;

  // Path 2: cached OAuth token
  if (
    !forceRefresh &&
    cachedToken &&
    cachedToken.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS
  ) {
    return cachedToken.token;
  }

  // Path 3: exchange (single-flight — multiple concurrent calls share one fetch)
  if (!inflightExchange) {
    inflightExchange = exchangeClientCredentials()
      .then((next) => {
        cachedToken = next;
        return next;
      })
      .finally(() => {
        inflightExchange = null;
      });
  }
  const fresh = await inflightExchange;
  return fresh.token;
}

export class ShopifyAdminError extends Error {
  constructor(
    message: string,
    public readonly userErrors?: ReadonlyArray<{ field?: string[] | null; message: string }>,
    public readonly graphqlErrors?: ReadonlyArray<{ message: string }>,
  ) {
    super(message);
    this.name = 'ShopifyAdminError';
  }
}

export async function adminFetch<TData>({
  query,
  variables,
}: {
  query: string;
  variables?: Record<string, unknown>;
}): Promise<TData> {
  const doFetch = async (token: string): Promise<Response> =>
    fetch(getAdminEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    });

  let token = await getAdminAccessToken();
  let res = await doFetch(token);

  // OAuth path: retry once on 401 with a freshly-exchanged token (handles the
  // edge case where our cached token expired exactly at the wire). For the
  // static-token path this is harmless — the retry will use the same env token.
  if (res.status === 401) {
    token = await getAdminAccessToken(true);
    res = await doFetch(token);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new ShopifyAdminError(
      `Shopify Admin HTTP ${res.status}: ${text.slice(0, 500)}`,
    );
  }

  const json = (await res.json()) as {
    data?: TData;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new ShopifyAdminError(
      `Shopify Admin GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`,
      undefined,
      json.errors,
    );
  }

  if (!json.data) {
    throw new ShopifyAdminError('Shopify Admin returned no data');
  }

  return json.data;
}

// --- Customers --------------------------------------------------------------

export type ShopifyCustomer = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  defaultAddress: {
    firstName: string | null;
    lastName: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    country: string | null;
    zip: string | null;
    phone: string | null;
  } | null;
};

export async function findCustomerByEmail(email: string): Promise<ShopifyCustomer | null> {
  const data = await adminFetch<{
    customers: { edges: Array<{ node: ShopifyCustomer }> };
  }>({
    query: /* GraphQL */ `
      query FindCustomer($query: String!) {
        customers(first: 1, query: $query) {
          edges {
            node {
              id
              email
              firstName
              lastName
              defaultAddress {
                firstName
                lastName
                address1
                address2
                city
                province
                country
                zip
                phone
              }
            }
          }
        }
      }
    `,
    variables: { query: `email:${email}` },
  });
  return data.customers.edges[0]?.node ?? null;
}

export async function createCustomer(input: {
  email: string;
  firstName?: string;
  lastName?: string;
}): Promise<ShopifyCustomer> {
  const data = await adminFetch<{
    customerCreate: {
      customer: ShopifyCustomer | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>({
    query: /* GraphQL */ `
      mutation CreateCustomer($input: CustomerInput!) {
        customerCreate(input: $input) {
          customer { id email firstName lastName defaultAddress { firstName lastName address1 address2 city province country zip phone } }
          userErrors { field message }
        }
      }
    `,
    variables: { input },
  });

  if (data.customerCreate.userErrors.length || !data.customerCreate.customer) {
    throw new ShopifyAdminError('customerCreate failed', data.customerCreate.userErrors);
  }
  return data.customerCreate.customer;
}

export async function findOrCreateCustomer(input: {
  email: string;
  firstName?: string;
  lastName?: string;
}): Promise<ShopifyCustomer> {
  const existing = await findCustomerByEmail(input.email);
  if (existing) return existing;
  return createCustomer(input);
}

// --- Orders -----------------------------------------------------------------

// orderCreate input shape — we're only using the fields we need.
// Full shape: https://shopify.dev/api/admin-graphql/latest/mutations/orderCreate
export type CreateOrderInput = {
  email: string;
  customerId?: string; // Shopify GID, e.g., "gid://shopify/Customer/123"
  currency?: string;
  tags?: string[];
  note?: string;
  financialStatus?: 'PAID' | 'PENDING' | 'AUTHORIZED' | 'PARTIALLY_PAID' | 'REFUNDED';
  lineItems: Array<{
    variantId?: string; // Shopify GID, e.g., "gid://shopify/ProductVariant/456"
    title?: string;
    quantity: number;
    priceSet?: { shopMoney: { amount: string; currencyCode: string } };
    // orderCreate does NOT inherit requiresShipping from the variant — it defaults
    // each line to false, which makes the mirrored order non-shippable (no Shopify
    // shipping-label flow, so a merchant's negotiated rates can't be applied). Pass
    // true for physical goods so the order is fulfillable with a label.
    requiresShipping?: boolean;
  }>;
  shippingAddress?: {
    firstName?: string;
    lastName?: string;
    address1?: string;
    address2?: string;
    city?: string;
    province?: string;
    country?: string;
    zip?: string;
    phone?: string;
  };
  metafields?: Array<{
    namespace: string;
    key: string;
    type: string;
    value: string;
  }>;
  transactions?: Array<{
    kind: 'SALE' | 'AUTHORIZATION' | 'CAPTURE';
    status: 'SUCCESS' | 'PENDING' | 'FAILURE' | 'ERROR';
    gateway?: string;
    amountSet: { shopMoney: { amount: string; currencyCode: string } };
  }>;
};

export type ShopifyOrder = {
  id: string;
  name: string;
  legacyResourceId: string;
};

export async function createOrder(input: CreateOrderInput): Promise<ShopifyOrder> {
  const data = await adminFetch<{
    orderCreate: {
      order: ShopifyOrder | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>({
    query: /* GraphQL */ `
      mutation CreateOrder($order: OrderCreateOrderInput!) {
        orderCreate(order: $order) {
          order { id name legacyResourceId }
          userErrors { field message }
        }
      }
    `,
    variables: { order: input },
  });

  if (data.orderCreate.userErrors.length || !data.orderCreate.order) {
    throw new ShopifyAdminError('orderCreate failed', data.orderCreate.userErrors);
  }
  return data.orderCreate.order;
}

// --- Products + Variants (read for mirror script) --------------------------

export type ShopifyProductForMirror = {
  id: string;
  title: string;
  description: string;
  handle: string;
  status: string;
  featuredImage: { url: string; altText: string | null } | null;
  isSubscribable: boolean;
  variants: Array<{
    id: string;
    title: string;
    sku: string | null;
    price: string;
    stripePriceIdOnetime: string | null;
    stripePriceIdSubscription: string | null;
  }>;
  stripeProductId: string | null;
};

export async function listProductsForMirror(): Promise<ShopifyProductForMirror[]> {
  const data = await adminFetch<{
    products: {
      edges: Array<{
        node: {
          id: string;
          title: string;
          description: string;
          handle: string;
          status: string;
          featuredImage: { url: string; altText: string | null } | null;
          isSubscribable: { value: string } | null;
          stripeProductId: { value: string } | null;
          variants: {
            edges: Array<{
              node: {
                id: string;
                title: string;
                sku: string | null;
                price: string;
                stripePriceIdOnetime: { value: string } | null;
                stripePriceIdSubscription: { value: string } | null;
              };
            }>;
          };
        };
      }>;
    };
  }>({
    query: /* GraphQL */ `
      query ListProducts {
        products(first: 50) {
          edges {
            node {
              id
              title
              description
              handle
              status
              featuredImage { url altText }
              isSubscribable: metafield(namespace: "mujo_commerce", key: "is_subscribable") { value }
              stripeProductId: metafield(namespace: "mujo_commerce", key: "stripe_product_id") { value }
              variants(first: 50) {
                edges {
                  node {
                    id
                    title
                    sku
                    price
                    stripePriceIdOnetime: metafield(namespace: "mujo_commerce", key: "stripe_price_id_onetime") { value }
                    stripePriceIdSubscription: metafield(namespace: "mujo_commerce", key: "stripe_price_id_subscription") { value }
                  }
                }
              }
            }
          }
        }
      }
    `,
  });

  return data.products.edges.map((e) => ({
    id: e.node.id,
    title: e.node.title,
    description: e.node.description,
    handle: e.node.handle,
    status: e.node.status,
    featuredImage: e.node.featuredImage,
    isSubscribable: e.node.isSubscribable?.value === 'true',
    stripeProductId: e.node.stripeProductId?.value ?? null,
    variants: e.node.variants.edges.map((ve) => ({
      id: ve.node.id,
      title: ve.node.title,
      sku: ve.node.sku,
      price: ve.node.price,
      stripePriceIdOnetime: ve.node.stripePriceIdOnetime?.value ?? null,
      stripePriceIdSubscription: ve.node.stripePriceIdSubscription?.value ?? null,
    })),
  }));
}
