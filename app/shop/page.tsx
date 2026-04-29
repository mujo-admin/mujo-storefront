import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { collectionPageSchema, jsonLdScript } from "lib/schema";

export const metadata: Metadata = {
  title: "Shop · Mujo",
  description: "The Mujo catalog. Mushroom cacao, Lemna bars, accessories.",
  alternates: { canonical: "/shop" },
};

export default function ShopPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            collectionPageSchema({
              url: "/shop",
              name: "Shop Mujo",
              description: "Mujo catalog overview.",
            }),
          ),
        }}
      />
      <ImportedPage filename="mujo_shop_all.html" />
    </>
  );
}
