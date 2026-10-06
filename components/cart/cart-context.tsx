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
import { usePathname } from 'next/navigation';
import {
  track,
  cartPurchaseType,
  itemFromCartLine,
  itemsValue,
} from 'lib/analytics';
import { buildRestoreUrl } from 'lib/cart/restore';
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

  // /checkout/success has its own clear-cart effect (success-client.tsx) and
  // server-side carts-row delete (page.tsx) — bypass both the hydration POST
  // merge and the debounced PUT here so we don't race-overwrite the empty
  // state. CartProvider re-mounts on Stripe's return_url full-page redirect.
  const pathname = usePathname();
  const skipMerge = pathname === '/checkout/success';

  // Hydrate from localStorage, then (if signed in) reconcile with the server cart.
  useEffect(() => {
    let cancelled = false;
    const stored = loadFromLocalStorage();
    const initial = stored ?? EMPTY_CART;
    setCart(initial);

    // Guest, or post-purchase landing: localStorage is the only source. Done.
    if (!session || skipMerge) {
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
  }, [session, skipMerge]);

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
  // Skip on /checkout/success — the success-client clear + server-side delete
  // own the post-purchase clean slate; a debounced PUT firing here would
  // re-sync a stale localStorage cart back to the server before that clear.
  useEffect(() => {
    if (!hydrated || !session || skipMerge) return;

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
  }, [cart, hydrated, session, skipMerge]);

  // Latest cart, readable from the callbacks below without re-creating them.
  const cartRef = useRef<Cart>(EMPTY_CART);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);

  // Every cart change in the app funnels through the three callbacks below, so
  // these are the only places the cart events fire. See docs/measurement-plan.md.
  const reportAdd = useCallback((line: CartLineItem, next: Cart) => {
    const added = itemFromCartLine(line);
    const cartItems = next.items.map(itemFromCartLine);
    track(
      'add_to_cart',
      {
        items: [added],
        value: itemsValue([added]),
        currency: 'USD',
        purchase_type: cartPurchaseType([added]),
      },
      {
        cart: cartItems,
        checkoutUrl: buildRestoreUrl(next.items, window.location.origin),
      },
    );
  }, []);

  const reportRemove = useCallback((line: CartLineItem) => {
    const removed = itemFromCartLine(line);
    track('remove_from_cart', {
      items: [removed],
      value: itemsValue([removed]),
      currency: 'USD',
    });
  }, []);

  const addItem = useCallback(
    (item: CartLineItem) => {
      const next = addItemPure(cartRef.current, item);
      cartRef.current = next;
      setCart(next);
      if (typeof window !== 'undefined') {
        reportAdd(item, next);
        window.dispatchEvent(new CustomEvent('mujo:cart:open'));
      }
    },
    [reportAdd],
  );

  const updateQuantity = useCallback(
    (stripePriceId: string, quantity: number) => {
      const before = cartRef.current;
      const line = before.items.find((i) => i.stripePriceId === stripePriceId);
      const next = updateQuantityPure(before, stripePriceId, quantity);
      cartRef.current = next;
      setCart(next);
      if (!line || typeof window === 'undefined') return;
      const after =
        next.items.find((i) => i.stripePriceId === stripePriceId)?.quantity ?? 0;
      const delta = after - line.quantity;
      if (delta > 0) reportAdd({ ...line, quantity: delta }, next);
      else if (delta < 0) reportRemove({ ...line, quantity: -delta });
    },
    [reportAdd, reportRemove],
  );

  const removeItem = useCallback(
    (stripePriceId: string) => {
      const before = cartRef.current;
      const line = before.items.find((i) => i.stripePriceId === stripePriceId);
      const next = removeItemPure(before, stripePriceId);
      cartRef.current = next;
      setCart(next);
      if (line && typeof window !== 'undefined') reportRemove(line);
    },
    [reportRemove],
  );

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
