// /api/cart/merge — auth-gated cart endpoints for Phase 4 cart ↔ account flow.
//
// Auth (all verbs): requires session cookie (401 if absent).
//
// POST — login-time merge.
//   Body: { items: CartLineItem[] } (the full localStorage cart from the browser)
//   Behavior: union-by-Price-ID with the server cart, sum quantities, clamp to
//   MAX_QUANTITY_PER_LINE. Returns the merged Cart so the client can write it
//   back to localStorage. Called on CartProvider mount when signedIn.
//
// PUT — post-merge replace (cross-device sync on mutations).
//   Body: { items: CartLineItem[] } (the new full client cart)
//   Behavior: replaces the server cart wholesale. Called debounced from the
//   client whenever the cart mutates after the initial merge. Without this,
//   adding items in browser A while logged in wouldn't surface in browser B.
//
// GET — fetch the server cart unchanged (read-only). Reserved for parity;
//   POST with empty items has the same effect.

import type { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { carts, db } from 'db';
import { getSession } from 'lib/session';
import { MAX_QUANTITY_PER_LINE, type Cart, type CartLineItem } from 'lib/cart/types';

export const dynamic = 'force-dynamic';

const cartLineItemSchema = z.object({
  stripePriceId: z.string().startsWith('price_'),
  productHandle: z.string().min(1),
  productTitle: z.string().min(1),
  variantTitle: z.string(),
  image: z.object({
    url: z.string(),
    alt: z.string(),
  }),
  unitAmountCents: z.number().int().nonnegative(),
  currency: z.literal('usd'),
  isSubscription: z.boolean(),
  quantity: z.number().int().positive().max(MAX_QUANTITY_PER_LINE),
});

const requestSchema = z.object({
  items: z.array(cartLineItemSchema).max(20),
});

function clampQuantity(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_QUANTITY_PER_LINE, Math.floor(n));
}

// MAX (not SUM) on quantity: localStorage and the server cart are two views
// of the same browser's cart, kept in sync by the debounced PUT in
// CartProvider. Summing them on every CartProvider re-mount (e.g. after a
// hard navigation like Stripe Checkout's return_url redirect) double-counted
// the cart. MAX is idempotent for the in-sync case and still preserves
// (a) first-time guest→logged-in transfer (server qty 0 → MAX(local, 0) = local),
// (b) cross-device pickup (browser B added more → server > local → MAX = server),
// (c) offline mutation recovery (PUT failed → local > server → MAX = local).
function mergeLines(a: CartLineItem[], b: CartLineItem[]): CartLineItem[] {
  const byPriceId = new Map<string, CartLineItem>();
  for (const item of a) {
    byPriceId.set(item.stripePriceId, { ...item });
  }
  for (const item of b) {
    const existing = byPriceId.get(item.stripePriceId);
    if (existing) {
      byPriceId.set(item.stripePriceId, {
        ...existing,
        quantity: clampQuantity(Math.max(existing.quantity, item.quantity)),
      });
    } else {
      byPriceId.set(item.stripePriceId, {
        ...item,
        quantity: clampQuantity(item.quantity),
      });
    }
  }
  return Array.from(byPriceId.values()).filter((i) => i.quantity > 0);
}

function isCartLineItem(x: unknown): x is CartLineItem {
  return cartLineItemSchema.safeParse(x).success;
}

function readServerItems(raw: unknown): CartLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isCartLineItem);
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const row = (
    await db.select().from(carts).where(eq(carts.customerId, session.customerId)).limit(1)
  )[0];

  const items = row ? readServerItems(row.items) : [];
  const cart: Cart = {
    items,
    updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : new Date(0).toISOString(),
  };
  return Response.json({ cart });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let parsed: z.infer<typeof requestSchema>;
  try {
    const body = await req.json();
    parsed = requestSchema.parse(body);
  } catch (err) {
    return Response.json(
      {
        error: 'invalid_request',
        details: err instanceof z.ZodError ? err.issues : String(err),
      },
      { status: 400 },
    );
  }

  const incoming = parsed.items;

  const existing = (
    await db.select().from(carts).where(eq(carts.customerId, session.customerId)).limit(1)
  )[0];
  const serverItems = existing ? readServerItems(existing.items) : [];

  const merged = mergeLines(serverItems, incoming);
  const now = new Date();

  if (existing) {
    await db
      .update(carts)
      .set({ items: merged, updatedAt: now })
      .where(eq(carts.customerId, session.customerId));
  } else {
    await db.insert(carts).values({
      customerId: session.customerId,
      items: merged,
      updatedAt: now,
    });
  }

  const cart: Cart = {
    items: merged,
    updatedAt: now.toISOString(),
  };
  return Response.json({ cart });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let parsed: z.infer<typeof requestSchema>;
  try {
    const body = await req.json();
    parsed = requestSchema.parse(body);
  } catch (err) {
    return Response.json(
      {
        error: 'invalid_request',
        details: err instanceof z.ZodError ? err.issues : String(err),
      },
      { status: 400 },
    );
  }

  const items = parsed.items.map((i) => ({
    ...i,
    quantity: clampQuantity(i.quantity),
  }));
  const now = new Date();

  const existing = (
    await db.select().from(carts).where(eq(carts.customerId, session.customerId)).limit(1)
  )[0];

  if (existing) {
    await db
      .update(carts)
      .set({ items, updatedAt: now })
      .where(eq(carts.customerId, session.customerId));
  } else {
    await db.insert(carts).values({
      customerId: session.customerId,
      items,
      updatedAt: now,
    });
  }

  const cart: Cart = {
    items,
    updatedAt: now.toISOString(),
  };
  return Response.json({ cart });
}
