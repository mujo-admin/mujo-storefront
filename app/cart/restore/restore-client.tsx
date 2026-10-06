"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "components/cart/cart-context";
import { parseRestoreParam } from "lib/cart/restore";
import { PRODUCTS } from "lib/product-identity";

/**
 * Rebuilds the cart named in the URL, merges it into whatever is already in
 * the cart (larger quantity wins), then lands on the first product's page with
 * the drawer open so the shopper sees the cart before being asked to pay.
 *
 * Does not fire `add_to_cart`: a restore is the same intent returning, not a
 * new one, and counting it would inflate the cart numbers.
 */
export function RestoreClient() {
  const router = useRouter();
  const { cart, hydrated, setCart } = useCart();
  const done = useRef(false);

  useEffect(() => {
    if (!hydrated || done.current) return;
    done.current = true;

    const restored = parseRestoreParam(
      new URLSearchParams(window.location.search).get("i"),
    );
    if (restored.length === 0) {
      router.replace("/shop");
      return;
    }

    const merged = new Map(cart.items.map((i) => [i.stripePriceId, i]));
    for (const line of restored) {
      const existing = merged.get(line.stripePriceId);
      merged.set(line.stripePriceId, {
        ...line,
        quantity: Math.max(existing?.quantity ?? 0, line.quantity),
      });
    }
    setCart({
      items: Array.from(merged.values()),
      updatedAt: new Date().toISOString(),
    });

    const first = restored[0];
    const route = (first && PRODUCTS[first.productHandle]?.route) || "/shop";
    router.replace(route);
    // Open the drawer once the product page has had a moment to mount.
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("mujo:cart:open"));
    }, 600);
  }, [hydrated, cart.items, router, setCart]);

  return (
    <div
      style={{
        minHeight: "50vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "var(--f-body)",
        color: "var(--ink-soft)",
        fontSize: "15px",
      }}
    >
      Bringing back your cart…
    </div>
  );
}
