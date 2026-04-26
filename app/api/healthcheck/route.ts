import { db } from 'db';
import { sql } from 'drizzle-orm';
import { stripe } from 'lib/stripe';
import { adminFetch } from 'lib/shopify-admin';

export const dynamic = 'force-dynamic';

type CheckResult = { ok: boolean; latency_ms?: number; error?: string };

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
  const start = Date.now();
  try {
    await fn();
    return { ok: true, latency_ms: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      latency_ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function GET() {
  const [database, stripeApi, shopifyAdmin] = await Promise.all([
    timed(async () => {
      await db.execute(sql`select 1`);
    }),
    timed(async () => {
      await stripe.balance.retrieve();
    }),
    timed(async () => {
      // Goes through the unified token resolver (legacy static OR OAuth Client
      // Credentials) so the healthcheck reflects the real auth path, not just
      // the legacy env var.
      await adminFetch<{ shop: { name: string } }>({
        query: /* GraphQL */ `query { shop { name } }`,
      });
    }),
  ]);

  const overall: CheckResult = {
    ok: database.ok && stripeApi.ok && shopifyAdmin.ok,
  };

  return Response.json(
    {
      status: overall.ok ? 'ok' : 'degraded',
      checks: { database, stripe: stripeApi, shopify_admin: shopifyAdmin },
      timestamp: new Date().toISOString(),
    },
    { status: overall.ok ? 200 : 503 },
  );
}
