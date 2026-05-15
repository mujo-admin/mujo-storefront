import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import {
  productSchema,
  breadcrumbSchema,
  jsonLdScript,
} from "lib/schema";

export const metadata: Metadata = {
  title: "Mujo Organic T-Shirt · Clean outside. Clean inside.",
  description:
    "Mujo Organic Tee. GOTS-certified, unisex, no shortcuts. Sand and White. Same standard as what you put in your body. $30.",
  alternates: { canonical: "/products/mujo-tee" },
  openGraph: {
    type: "website",
    title: "Mujo Organic T-Shirt",
    description: "Clean outside. Clean inside. GOTS-certified organic cotton.",
  },
};

export default function TeePdpPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            productSchema({
              url: "/products/mujo-tee",
              name: "Mujo Organic T-Shirt",
              description:
                "GOTS + OCS certified 100% organic cotton tee. Ring-spun combed, lightweight, regular unisex fit. Sand or White.",
              image: "https://mujoworld.com/images/logo/mujo-logo-orange.png",
              lowPrice: "30",
              highPrice: "30",
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
              { name: "Mujo Organic T-Shirt", url: "/products/mujo-tee" },
            ]),
          ),
        }}
      />
      <ImportedPage filename="merch_tee.html" />
    </>
  );
}
