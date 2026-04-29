import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { collectionPageSchema, jsonLdScript } from "lib/schema";

export const metadata: Metadata = {
  title: "Shop the Lemna Bar · All flavors · Mujo",
  description: "Browse Lemna Bar flavors. Founding member access only.",
  robots: { index: false, follow: false },
  // Hub-and-spoke: browse equity flows to /products/lemna for conversion intent.
  alternates: { canonical: "/products/lemna" },
};

export default function LemnaShopPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            collectionPageSchema({
              url: "/lemna/shop",
              name: "Lemna Bar — flavors",
              description: "Browse Lemna Bar flavors.",
            }),
          ),
        }}
      />
      <ImportedPage filename="mujo_lemna_shop.html" />
    </>
  );
}
