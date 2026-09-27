"use client";

import { useEffect, useRef } from "react";
import { track } from "lib/analytics";

type Props = {
  /** Stripe Price ID of the default variant — the cart's primary key. */
  itemId: string;
  itemName: string;
  /** Major units (dollars). The price shown by default on the page. */
  price: number;
};

/**
 * <ProductAnalytics /> — fires `view_item` once per PDP view.
 *
 * PDPs are largely imported HTML, so there's no React component owning the
 * product to hang this off. Each PDP route renders this with the same facts it
 * already passes to `productSchema()` for JSON-LD, keeping one set of numbers.
 *
 * `view_item` is server-mirrored to Meta (see docs/measurement-plan.md) — it's
 * the signal that makes product retargeting and catalogue ads possible, and
 * right now Mujo sends none.
 */
export function ProductAnalytics({ itemId, itemName, price }: Props) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    track("view_item", {
      items: [{ item_id: itemId, item_name: itemName, price, quantity: 1 }],
      value: price,
      currency: "USD",
    });
  }, [itemId, itemName, price]);

  return null;
}
