import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import {
  productSchema,
  breadcrumbSchema,
  jsonLdScript,
} from "lib/schema";

export const metadata: Metadata = {
  title: "Mujo Electric Frother · The proper finish",
  description:
    "The 10-second step that elevates your Mujo ritual. Electric frother for perfectly blended mushroom cacao — silky, warm, yours every morning. $20.",
  alternates: { canonical: "/products/mujo-frother" },
  openGraph: {
    type: "website",
    title: "Mujo Electric Frother",
    description: "The 10-second step that elevates your Mujo ritual.",
  },
};

export default function FrotherPdpPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            productSchema({
              url: "/products/mujo-frother",
              name: "Mujo Electric Frother",
              description:
                "USB-C rechargeable electric milk frother. Stainless steel whisk, up to 50 uses per charge. Includes Mujo Travel Lid.",
              image: "https://mujoworld.com/images/logo/mujo-logo-orange.png",
              lowPrice: "20",
              highPrice: "20",
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
              { name: "Mujo Electric Frother", url: "/products/mujo-frother" },
            ]),
          ),
        }}
      />
      <ImportedPage filename="merch_frother.html" />
    </>
  );
}
