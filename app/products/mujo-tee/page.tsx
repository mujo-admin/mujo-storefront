import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { ProductAnalytics } from "components/integrations/product-analytics";
import {
  productSchema,
  breadcrumbSchema,
  jsonLdScript,
} from "lib/schema";

export const metadata: Metadata = {
  title: "Organic Tee · GOTS-Certified Organic Cotton",
  description:
    "A soft, lightweight tee in 100% GOTS-certified organic cotton. Regular unisex fit, a small Mujo mark and a tear-away label. White or Desert Dust.",
  alternates: { canonical: "/products/mujo-tee" },
  openGraph: {
    type: "website",
    title: "Organic Tee",
    description: "A soft, lightweight tee in 100% GOTS-certified organic cotton. Regular unisex fit, a small Mujo mark and a tear-away label. White or Desert Dust.",
  },
};

export default function TeePdpPage() {
  return (
    <>
      <ProductAnalytics itemId="mujo-tee" itemName="Organic Tee" price={30} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            productSchema({
              url: "/products/mujo-tee",
              name: "Organic Tee",
              description:
                "A clean, everyday tee in 100% organic cotton, GOTS and OCS certified. Ring-spun and combed for a soft feel, lightweight, with a regular unisex fit and a small Mujo mark. The label tears away, so nothing scratches. Made to order in White or Desert Dust, sizes S to XL.",
              image: "https://mujoworld.com/images/logo/mujo-logo-orange.png",
              lowPrice: "30",
              highPrice: "30",
              offerCount: 8,
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
              { name: "Organic Tee", url: "/products/mujo-tee" },
            ]),
          ),
        }}
      />
      <ImportedPage filename="merch_tee.html" />
    </>
  );
}
