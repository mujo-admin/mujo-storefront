"use client";

import { useEffect, useRef } from "react";
import { track } from "lib/analytics";
import { PRODUCTS, defaultPrice } from "lib/product-identity";

type Props = {
  /** Route slug (`mujo-ritual`). ID, name and price resolve from it. */
  slug: string;
};

/**
 * <ProductAnalytics /> — fires `view_item` once per PDP view.
 *
 * PDPs are largely imported HTML, so there's no React component owning the
 * product to hang this off. Each PDP route renders this with its slug only:
 * the product ID, name and price come from `lib/product-identity.ts`, which
 * reads the same price map the cart does. No numbers are typed into pages.
 *
 * `view_item` is server-mirrored to Meta and sent to Klaviyo as "Viewed
 * Product" (see docs/measurement-plan.md). It is the signal behind product
 * retargeting, catalogue ads and the browse abandonment email.
 */
export function ProductAnalytics({ slug }: Props) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    const product = PRODUCTS[slug];
    if (!product) return;
    fired.current = true;

    const price = defaultPrice(slug);
    track("view_item", {
      items: [
        {
          item_id: product.id,
          item_name: product.name,
          price,
          quantity: 1,
        },
      ],
      value: price,
      currency: "USD",
    });
  }, [slug]);

  return null;
}
