'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  addItem as addItemPure,
  loadFromLocalStorage,
  removeItem as removeItemPure,
  saveToLocalStorage,
  updateQuantity as updateQuantityPure,
} from 'lib/cart/store';
import { EMPTY_CART, type Cart, type CartLineItem } from 'lib/cart/types';

type SessionSnapshot = {
  customerId: string;
  email: string;
} | null;

type CartContextValue = {
  cart: Cart;
  totalQuantity: number;
  addItem: (item: CartLineItem) => void;
  updateQuantity: (stripePriceId: string, quantity: number) => void;
  removeItem: (stripePriceId: string) => void;
  /** Replace the whole cart (used by Phase 4 cart-merge after login). */
  setCart: (cart: Cart) => void;
  /** True until the client has rehydrated from localStorage + (if logged in) the server cart. */
  hydrated: boolean;
  /** Customer is signed in — derived from the server-passed session prop. */
  signedIn: boolean;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

/**
 * Cart provider — localStorage-backed for guests. For logged-in customers
 * (server-passed `session` prop), syncs with the Postgres `carts` row on
 * mount via /api/cart/merge: union-by-Price-ID + sum quantities. Server cart
 * becomes the source of truth post-merge; localStorage stays in sync for
 * snappy first-paint on subsequent loads.
 *
 * Add-to-cart side effect: dispatches `mujo:cart:open` so <SiteHeader />
 * slides the drawer open. Decoupled from drawer-open state to keep this
 * context independent of the chrome that renders it.
 */
export function CartProvider({
  children,
  session = null,
}: {
  children: ReactNode;
  session?: SessionSnapshot;
}) {
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [hydrated, setHydrated] = useState(false);
  // Skip the auto-persist effect on the post-merge state replacement so we
  // don't kick off a re-write to localStorage that we just wrote.
  const skipNextPersistRef = useRef(false);

  // Hydrate from localStorage, then (if signed in) reconcile with the server cart.
  useEffect(() => {
    let cancelled = false;
    const stored = loadFromLocalStorage();
    const initial = stored ?? EMPTY_CART;
    setCart(initial);

    // Guest: localStorage is the only source. Done.
    if (!session) {
      setHydrated(true);
      return;
    }

    // Logged-in: POST localStorage to /api/cart/merge → write merged result back.
    // If localStorage is empty, this still hits the server (returns the existing
    // server cart unchanged), so cross-device sync works without a manual login click.
    fetch('/api/cart/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: initial.items }),
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`cart merge failed: ${r.status}`);
        return (await r.json()) as { cart: Cart };
      })
      .then((data) => {
        if (cancelled) return;
        skipNextPersistRef.current = true;
        setCart(data.cart);
        saveToLocalStorage(data.cart);
      })
      .catch((err) => {
        if (cancelled) return;
        // Soft-fail: keep localStorage cart so the customer is never blocked.
        // The next mutation will trigger another save; cross-device merge will
        // recover on next login.
        console.error('[cart] merge failed, falling back to localStorage', err);
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });

    return () => {
      cancelled = true;
    };
  }, [session]);

  // Persist on every cart change post-hydration.
  useEffect(() => {
    if (!hydrated) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    saveToLocalStorage(cart);
  }, [cart, hydrated]);

  // Logged-in: debounced server sync so cart edits in browser A surface in
  // browser B on next login. PUT is a wholesale replace (the initial merge has
  // already happened on mount). 800ms gives bursty toggles room to settle.
  useEffect(() => {
    if (!hydrated || !session) return;

    const timer = setTimeout(() => {
      void fetch('/api/cart/merge', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart.items }),
      }).catch((err) => {
        // Soft-fail: localStorage already has the source of truth for this
        // browser. Cross-device drift is a single login away from recovery.
        console.error('[cart] server sync failed', err);
      });
    }, 800);

    return () => clearTimeout(timer);
  }, [cart, hydrated, session]);

  const addItem = useCallback((item: CartLineItem) => {
    setCart((prev) => addItemPure(prev, item));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('mujo:cart:open'));
    }
  }, []);

  const updateQuantity = useCallback(
    (stripePriceId: string, quantity: number) => {
      setCart((prev) => updateQuantityPure(prev, stripePriceId, quantity));
    },
    [],
  );

  const removeItem = useCallback((stripePriceId: string) => {
    setCart((prev) => removeItemPure(prev, stripePriceId));
  }, []);

  // On logout the page navigates with a full reload — LogoutButton calls
  // clearLocalStorage() directly before navigation. No cleanup needed here.

  const value = useMemo<CartContextValue>(() => {
    const totalQuantity = cart.items.reduce((s, i) => s + i.quantity, 0);
    return {
      cart,
      totalQuantity,
      addItem,
      updateQuantity,
      removeItem,
      setCart,
      hydrated,
      signedIn: session !== null,
    };
  }, [cart, hydrated, addItem, updateQuantity, removeItem, session]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
