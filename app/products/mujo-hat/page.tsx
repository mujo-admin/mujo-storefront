import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { ProductAnalytics } from "components/integrations/product-analytics";
import {
  productSchema,
  breadcrumbSchema,
  jsonLdScript,
} from "lib/schema";

export const metadata: Metadata = {
  title: "Baseball Cap · Embroidered Mujo Mark",
  description:
    "A low-profile, unstructured cap with an embroidered Mujo mark and an adjustable strap. One size fits most. White or Stone.",
  alternates: { canonical: "/products/mujo-hat" },
  openGraph: {
    type: "website",
    title: "Baseball Cap",
    description: "A low-profile, unstructured cap with an embroidered Mujo mark and an adjustable strap. One size fits most. White or Stone.",
  },
};

export default function HatPdpPage() {
  return (
    <>
      <ProductAnalytics slug="mujo-hat" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            productSchema({
              url: "/products/mujo-hat",
              name: "Baseball Cap",
              description:
                "A low-profile cap with the Mujo mark embroidered on the front. A soft, unstructured six-panel crown, an adjustable strap at the back, one size that fits most. The logo is stitched, not printed, so it won't peel or crack. Made to order in White or Stone.",
              image: "https://mujoworld.com/images/logo/mujo-logo-brown.png",
              lowPrice: "25",
              highPrice: "25",
              offerCount: 2,
              inStock: true,
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbSchema([
              { name: "Shop", url: "/shop" },
              { name: "Baseball Cap", url: "/products/mujo-hat" },
            ]),
          ),
        }}
      />
      <ImportedPage filename="merch_hat.html" />
    </>
  );
}
