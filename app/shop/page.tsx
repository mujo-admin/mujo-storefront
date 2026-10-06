import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { collectionPageSchema, jsonLdScript } from "lib/schema";

export const metadata: Metadata = {
  title: "Shop Mushroom Coffee Alternative & Protein Powder",
  description:
    "Shop Mujo: The Ritual mushroom coffee alternative, plant-based Protein Powder made with Lemna leaf, the electric frother and organic cotton merch.",
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
              description:
                "Shop Mujo: The Ritual mushroom coffee alternative, plant-based Protein Powder made with Lemna leaf, the electric frother and organic cotton merch.",
            }),
          ),
        }}
      />
      <ImportedPage filename="mujo_shop_all.html" />
    </>
  );
}
