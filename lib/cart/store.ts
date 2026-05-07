import {
  CART_STORAGE_KEY,
  CART_STORAGE_VERSION,
  EMPTY_CART,
  MAX_QUANTITY_PER_LINE,
  type Cart,
  type CartLineItem,
} from './types';

type StoredCart = {
  v: number;
  cart: Cart;
};

function isCartLineItem(x: unknown): x is CartLineItem {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.stripePriceId === 'string' &&
    typeof o.productHandle === 'string' &&
    typeof o.productTitle === 'string' &&
    typeof o.variantTitle === 'string' &&
    typeof o.unitAmountCents === 'number' &&
    typeof o.currency === 'string' &&
    typeof o.isSubscription === 'boolean' &&
    typeof o.quantity === 'number'
  );
}

export function loadFromLocalStorage(): Cart | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCart;
    if (!parsed || parsed.v !== CART_STORAGE_VERSION) return null;
    if (!parsed.cart || !Array.isArray(parsed.cart.items)) return null;
    const items = parsed.cart.items.filter(isCartLineItem);
    return {
      items,
      updatedAt: typeof parsed.cart.updatedAt === 'string'
        ? parsed.cart.updatedAt
        : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveToLocalStorage(cart: Cart): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: StoredCart = { v: CART_STORAGE_VERSION, cart };
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota exceeded or storage disabled. Cart stays in memory; on next
    // mutation we'll try again. Not worth surfacing to the customer.
  }
}

export function clearLocalStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CART_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function clampQuantity(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_QUANTITY_PER_LINE, Math.floor(n));
}

/**
 * Add a line item. If a line with the same Stripe Price ID already exists,
 * sum quantities (clamped to MAX_QUANTITY_PER_LINE). Returns a new Cart.
 */
export function addItem(cart: Cart, item: CartLineItem): Cart {
  const existing = cart.items.find(
    (i) => i.stripePriceId === item.stripePriceId,
  );
  if (existing) {
    const merged: CartLineItem = {
      ...existing,
      quantity: clampQuantity(existing.quantity + item.quantity),
    };
    return {
      items: cart.items.map((i) =>
        i.stripePriceId === item.stripePriceId ? merged : i,
      ),
      updatedAt: new Date().toISOString(),
    };
  }
  return {
    items: [
      ...cart.items,
      { ...item, quantity: clampQuantity(item.quantity) },
    ],
    updatedAt: new Date().toISOString(),
  };
}

/** Set quantity on a line. Quantity 0 removes it. */
export function updateQuantity(
  cart: Cart,
  stripePriceId: string,
  quantity: number,
): Cart {
  const next = clampQuantity(quantity);
  if (next === 0) return removeItem(cart, stripePriceId);
  return {
    items: cart.items.map((i) =>
      i.stripePriceId === stripePriceId ? { ...i, quantity: next } : i,
    ),
    updatedAt: new Date().toISOString(),
  };
}

export function removeItem(cart: Cart, stripePriceId: string): Cart {
  const items = cart.items.filter((i) => i.stripePriceId !== stripePriceId);
  if (items.length === cart.items.length) return cart;
  return { items, updatedAt: new Date().toISOString() };
}

export function makeEmptyCart(): Cart {
  return { ...EMPTY_CART, items: [] };
}
