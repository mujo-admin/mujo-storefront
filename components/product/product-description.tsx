import Price from "components/price";
import Prose from "components/prose";
import { Product } from "lib/shopify/types";
import { VariantSelector } from "./variant-selector";

/**
 * Generic Shopify-product fallback view for /product/[handle]. Mujo's
 * canonical PDPs (/products/mujo-ritual, /products/lemna) carry the real
 * Add-to-Cart UI via Stripe Price IDs. This route is the read-only catch-all
 * for any other Shopify product — viewer-only since cart lines are keyed
 * off Stripe Price IDs, not Shopify variant IDs.
 */
export function ProductDescription({ product }: { product: Product }) {
  return (
    <>
      <div className="mb-6 flex flex-col border-b pb-6 dark:border-neutral-700">
        <h1 className="mb-2 text-5xl font-medium">{product.title}</h1>
        <div className="mr-auto w-auto rounded-full bg-blue-600 p-2 text-sm text-white">
          <Price
            amount={product.priceRange.maxVariantPrice.amount}
            currencyCode={product.priceRange.maxVariantPrice.currencyCode}
          />
        </div>
      </div>
      <VariantSelector options={product.options} variants={product.variants} />
      {product.descriptionHtml ? (
        <Prose
          className="mb-6 text-sm leading-tight dark:text-white/[60%]"
          html={product.descriptionHtml}
        />
      ) : null}
    </>
  );
}
