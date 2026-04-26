// Shopify Admin API GraphQL client. Separate from lib/shopify (Storefront API)
// because Admin uses a different endpoint, different auth header, and writes
// orders/customers/metafields that the storefront read-side never touches.

const ADMIN_API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION ?? '2025-01';

function getAdminEndpoint(): string {
  const domain = process.env.SHOPIFY_STORE_DOMAIN;
  if (!domain) throw new Error('SHOPIFY_STORE_DOMAIN is not set');
  const host = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${host}/admin/api/${ADMIN_API_VERSION}/graphql.json`;
}

function getAdminToken(): string {
  const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
  if (!token) throw new Error('SHOPIFY_ADMIN_API_ACCESS_TOKEN is not set');
  return token;
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
  const res = await fetch(getAdminEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': getAdminToken(),
    },
    body: JSON.stringify({ query, variables }),
    cache: 'no-store',
  });

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
