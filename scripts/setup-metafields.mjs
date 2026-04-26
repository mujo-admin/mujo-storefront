// Idempotent setup script for the mujo_commerce metafield namespace.
//
// What it does:
//   1. Creates 10 metafield definitions (PRODUCT, PRODUCTVARIANT, CUSTOMER,
//      ORDER) via Admin GraphQL — so they show up properly in Shopify admin
//      with named labels + correct types instead of ad-hoc "custom" entries.
//   2. Sets mujo_commerce.is_subscribable = true on the Mujo Ritual product
//      (handle: the-ritual). Required by the mirror script to know which
//      products get a recurring Stripe Price in addition to one-time.
//
// Idempotent: re-runs are safe. Existing definitions are left alone (Shopify
// returns an error code we swallow). is_subscribable is upserted.
//
// Usage: node --env-file=.env.local scripts/setup-metafields.mjs

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const clientId = process.env.SHOPIFY_ADMIN_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_ADMIN_CLIENT_SECRET;
const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION ?? '2026-04';

if (!domain || !clientId || !clientSecret) {
  console.error('Missing env vars (SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_CLIENT_ID / SHOPIFY_ADMIN_CLIENT_SECRET)');
  process.exit(1);
}

const host = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

// --- Token exchange (same as smoke test) ---
const tokenRes = await fetch(`https://${host}/admin/oauth/access_token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  }),
});
if (!tokenRes.ok) {
  console.error(`Token exchange failed: ${tokenRes.status}`);
  console.error(await tokenRes.text());
  process.exit(1);
}
const { access_token: token } = await tokenRes.json();

async function gql(query, variables = {}) {
  const res = await fetch(`https://${host}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': token,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) {
    throw new Error('GraphQL errors: ' + JSON.stringify(json.errors));
  }
  return json.data;
}

// --- Metafield definitions to create ---
const NAMESPACE = 'mujo_commerce';

// Note: Shopify type identifiers on the GraphQL API
//   single_line_text_field, boolean, date, json
const definitions = [
  // PRODUCT
  { ownerType: 'PRODUCT', key: 'stripe_product_id', name: 'Stripe Product ID', type: 'single_line_text_field', description: 'Stripe Product ID (prod_…) mirrored from this Shopify product.' },
  { ownerType: 'PRODUCT', key: 'is_subscribable', name: 'Is Subscribable', type: 'boolean', description: 'Whether this product offers a subscription option. Gates the recurring Stripe Price + frontend subscribe toggle.' },

  // PRODUCTVARIANT
  { ownerType: 'PRODUCTVARIANT', key: 'stripe_price_id_onetime', name: 'Stripe Price ID (one-time)', type: 'single_line_text_field', description: 'Stripe Price ID for a one-time purchase of this variant.' },
  { ownerType: 'PRODUCTVARIANT', key: 'stripe_price_id_subscription', name: 'Stripe Price ID (subscription)', type: 'single_line_text_field', description: 'Stripe Price ID for the recurring subscription of this variant.' },

  // CUSTOMER
  { ownerType: 'CUSTOMER', key: 'stripe_customer_id', name: 'Stripe Customer ID', type: 'single_line_text_field', description: 'cus_… linkage from this Shopify customer to their Stripe customer record.' },
  { ownerType: 'CUSTOMER', key: 'subscription_status', name: 'Subscription status', type: 'single_line_text_field', description: 'Echoed Stripe subscription status (active / past_due / paused / canceled / etc).' },
  { ownerType: 'CUSTOMER', key: 'current_period_end', name: 'Subscription period end', type: 'date', description: 'Date of next subscription renewal (or end of cancellation period).' },

  // ORDER
  { ownerType: 'ORDER', key: 'stripe_charge_id', name: 'Stripe Charge ID', type: 'single_line_text_field', description: 'Stripe charge that paid for this order.' },
  { ownerType: 'ORDER', key: 'stripe_invoice_id', name: 'Stripe Invoice ID', type: 'single_line_text_field', description: 'Stripe invoice (subscription orders only).' },
  { ownerType: 'ORDER', key: 'stripe_subscription_id', name: 'Stripe Subscription ID', type: 'single_line_text_field', description: 'Parent subscription (subscription orders only).' },
];

console.log(`\n→ Creating ${definitions.length} metafield definitions in namespace '${NAMESPACE}'…\n`);

const CREATE = /* GraphQL */ `
  mutation Create($definition: MetafieldDefinitionInput!) {
    metafieldDefinitionCreate(definition: $definition) {
      createdDefinition { id name namespace key }
      userErrors { field message code }
    }
  }
`;

for (const d of definitions) {
  const data = await gql(CREATE, {
    definition: {
      name: d.name,
      namespace: NAMESPACE,
      key: d.key,
      description: d.description,
      type: d.type,
      ownerType: d.ownerType,
      pin: true,
      access: { storefront: 'PUBLIC_READ' },
    },
  });

  const errors = data.metafieldDefinitionCreate.userErrors;
  if (errors.length > 0) {
    const taken = errors.find((e) => e.code === 'TAKEN' || /already.*exists/i.test(e.message));
    if (taken) {
      console.log(`  ↷ ${d.ownerType}.${d.key} already exists — skipping`);
      continue;
    }
    console.error(`  ✗ ${d.ownerType}.${d.key}: ${JSON.stringify(errors)}`);
    continue;
  }
  const created = data.metafieldDefinitionCreate.createdDefinition;
  console.log(`  ✓ Created ${d.ownerType}.${created.namespace}.${created.key} (${created.id})`);
}

// --- Set is_subscribable=true on Mujo Ritual ---
console.log(`\n→ Setting ${NAMESPACE}.is_subscribable=true on the-ritual…`);

// Find the product by handle
const lookupRes = await gql(/* GraphQL */ `
  query { productByHandle(handle: "the-ritual") { id title handle } }
`);
const ritual = lookupRes.productByHandle;
if (!ritual) {
  console.error('  ✗ Product handle "the-ritual" not found. Skipping.');
  console.error('    (List handles: query { products(first:10){edges{node{handle title}}} })');
  process.exit(0);
}
console.log(`  Found: ${ritual.title} (${ritual.id})`);

const setRes = await gql(/* GraphQL */ `
  mutation Set($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id namespace key value }
      userErrors { field message }
    }
  }
`, {
  metafields: [
    {
      ownerId: ritual.id,
      namespace: NAMESPACE,
      key: 'is_subscribable',
      type: 'boolean',
      value: 'true',
    },
  ],
});

const setErrors = setRes.metafieldsSet.userErrors;
if (setErrors.length > 0) {
  console.error(`  ✗ ${JSON.stringify(setErrors)}`);
  process.exit(1);
}
const set = setRes.metafieldsSet.metafields[0];
console.log(`  ✓ Set ${set.namespace}.${set.key} = ${set.value}`);

console.log('\nDone. Mujo Ritual is now subscribable. You can run the mirror script next.');
