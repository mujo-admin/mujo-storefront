'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

type CartContextValue = {
  cart: Cart;
  totalQuantity: number;
  addItem: (item: CartLineItem) => void;
  updateQuantity: (stripePriceId: string, quantity: number) => void;
  removeItem: (stripePriceId: string) => void;
  /** Replace the whole cart (used by Phase 4 cart-merge after login). */
  setCart: (cart: Cart) => void;
  /** True until the client has rehydrated from localStorage. */
  hydrated: boolean;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);

/**
 * Cart provider — localStorage-backed for guests, hybrid for logged-in
 * customers (Phase 4 will add server-cart sync). SSR-safe: starts with
 * EMPTY_CART; client useEffect rehydrates from localStorage.
 *
 * Add-to-cart side effect: dispatches `mujo:cart:open` so <SiteHeader />
 * slides the drawer open. Decoupled from drawer-open state to keep this
 * context independent of the chrome that renders it.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = loadFromLocalStorage();
    if (stored) setCart(stored);
    setHydrated(true);
  }, []);

  // Persist on every cart change post-hydration.
  useEffect(() => {
    if (!hydrated) return;
    saveToLocalStorage(cart);
  }, [cart, hydrated]);

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
    };
  }, [cart, hydrated, addItem, updateQuantity, removeItem]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within a CartProvider');
  return ctx;
}
