// Shopify Admin OAuth Client Credentials smoke test.
// Exchanges client_id + client_secret for an access token, then runs a tiny
// GraphQL query against the Admin API to confirm scopes + connectivity.
//
// Usage: node --env-file=.env.local scripts/shopify-admin-smoke.mjs

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const clientId = process.env.SHOPIFY_ADMIN_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_ADMIN_CLIENT_SECRET;
const apiVersion = process.env.SHOPIFY_ADMIN_API_VERSION ?? '2026-04';

if (!domain || !clientId || !clientSecret) {
  console.error('Missing env: SHOPIFY_STORE_DOMAIN / SHOPIFY_ADMIN_CLIENT_ID / SHOPIFY_ADMIN_CLIENT_SECRET');
  process.exit(1);
}

const host = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

console.log(`→ Exchanging Client Credentials for access token…`);
console.log(`  Host: ${host}`);
console.log(`  Client ID: ${clientId}`);

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
  const text = await tokenRes.text();
  console.error(`✗ Token exchange failed: HTTP ${tokenRes.status}`);
  console.error(text.slice(0, 500));
  process.exit(1);
}

const tokenBody = await tokenRes.json();
console.log(`✓ Got access token (length: ${tokenBody.access_token?.length}, expires_in: ${tokenBody.expires_in ?? 'not specified'})`);
if (tokenBody.scope) console.log(`  Scope: ${tokenBody.scope}`);

console.log(`\n→ Calling Admin GraphQL: shop { name id myshopifyDomain primaryDomain { url } }…`);

const gqlRes = await fetch(`https://${host}/admin/api/${apiVersion}/graphql.json`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Shopify-Access-Token': tokenBody.access_token,
  },
  body: JSON.stringify({
    query: /* GraphQL */ `
      query {
        shop {
          id
          name
          myshopifyDomain
          primaryDomain { url }
          email
          plan { displayName }
        }
        currentAppInstallation {
          accessScopes { handle }
        }
      }
    `,
  }),
});

if (!gqlRes.ok) {
  console.error(`✗ Admin GraphQL HTTP ${gqlRes.status}`);
  console.error((await gqlRes.text()).slice(0, 500));
  process.exit(1);
}

const gqlBody = await gqlRes.json();
if (gqlBody.errors) {
  console.error('✗ GraphQL errors:');
  console.error(JSON.stringify(gqlBody.errors, null, 2));
  process.exit(1);
}

console.log(`✓ Admin API connected.`);
console.log(`  Shop: ${gqlBody.data.shop.name} (${gqlBody.data.shop.id})`);
console.log(`  myshopify domain: ${gqlBody.data.shop.myshopifyDomain}`);
console.log(`  Primary domain: ${gqlBody.data.shop.primaryDomain.url}`);
console.log(`  Plan: ${gqlBody.data.shop.plan.displayName}`);
console.log(`  Email: ${gqlBody.data.shop.email}`);

const scopes = gqlBody.data.currentAppInstallation?.accessScopes ?? [];
console.log(`\n  Granted scopes (${scopes.length}):`);
for (const s of scopes) console.log(`    - ${s.handle}`);

const required = [
  'read_orders', 'write_orders',
  'read_products', 'write_products',
  'read_customers', 'write_customers',
  'read_inventory', 'write_inventory',
  'read_metaobjects', 'write_metaobjects',
];
const granted = new Set(scopes.map((s) => s.handle));
const missing = required.filter((r) => !granted.has(r));
if (missing.length) {
  console.warn(`\n⚠ Missing scopes: ${missing.join(', ')}`);
  console.warn(`  Go back to the app config, add them, Release a new version, and re-run this smoke test.`);
} else {
  console.log(`\n✓ All 10 required scopes granted.`);
}
