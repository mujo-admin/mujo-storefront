import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { ProductAnalytics } from "components/integrations/product-analytics";
import {
  productSchema,
  breadcrumbSchema,
  jsonLdScript,
} from "lib/schema";

export const metadata: Metadata = {
  title: "Crewneck Sweatshirt · Cotton-Rich Fleece",
  description:
    "A medium-heavyweight crewneck in cotton-rich fleece with a 100% cotton face. Ribbed cuffs, regular unisex fit. Bone or Sandstone, XS to XL.",
  alternates: { canonical: "/products/mujo-crew" },
  openGraph: {
    type: "website",
    title: "Crewneck",
    description: "A medium-heavyweight crewneck in cotton-rich fleece with a 100% cotton face. Ribbed cuffs, regular unisex fit. Bone or Sandstone, XS to XL.",
  },
};

export default function CrewPdpPage() {
  return (
    <>
      <ProductAnalytics slug="mujo-crew" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            productSchema({
              url: "/products/mujo-crew",
              name: "Crewneck",
              description:
                "A medium-heavyweight crewneck in soft, cotton-rich fleece: 80% cotton and 20% polyester, with a 100% cotton face. Smooth outside, cozy inside, with ribbed cuffs and hem and a regular unisex fit. The label tears away. Made to order in Bone or Sandstone, sizes XS to XL.",
              image: "https://mujoworld.com/images/logo/mujo-logo-terracotta.png",
              lowPrice: "40",
              highPrice: "40",
              offerCount: 9,
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
              { name: "Crewneck", url: "/products/mujo-crew" },
            ]),
          ),
        }}
      />
      <ImportedPage filename="merch_crew.html" />
    </>
  );
}
