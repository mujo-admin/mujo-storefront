import { db } from 'db';
import { sql } from 'drizzle-orm';
import { stripe } from 'lib/stripe';

export const runtime = 'nodejs';
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
      const domain = process.env.SHOPIFY_STORE_DOMAIN;
      const token = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;
      if (!domain || !token) throw new Error('Shopify Admin env not configured');
      const res = await fetch(
        `https://${domain.replace(/^https?:\/\//, '')}/admin/api/${process.env.SHOPIFY_ADMIN_API_VERSION ?? '2025-01'}/shop.json`,
        { headers: { 'X-Shopify-Access-Token': token }, cache: 'no-store' },
      );
      if (!res.ok) throw new Error(`Shopify Admin HTTP ${res.status}`);
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
