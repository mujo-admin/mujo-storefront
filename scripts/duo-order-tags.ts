// Prints the tags, discount code and line items of one Shopify order, by name.
// Used to check that Daily Ritual Duo test orders carry `black-friday-duo-2026`.
// Read-only. Uses .env.local.
//
//   pnpm tsx scripts/duo-order-tags.ts 31442

import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const name = (process.argv[2] ?? "").replace(/^#/, "");
  if (!name) throw new Error("Pass an order number, e.g. 31442");
  const { adminFetch } = await import("lib/shopify-admin");
  const res = await adminFetch<{
    orders: {
      nodes: Array<{
        name: string;
        tags: string[];
        test: boolean;
        discountCodes: string[];
        displayFinancialStatus: string;
        lineItems: { nodes: Array<{ title: string; quantity: number }> };
      }>;
    };
  }>({
    query: `query ($q: String!) {
      orders(first: 1, query: $q) {
        nodes {
          name tags test discountCodes displayFinancialStatus
          lineItems(first: 20) { nodes { title quantity } }
        }
      }
    }`,
    variables: { q: `name:${name}` },
  });
  console.log(JSON.stringify(res, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
