import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import {
  productSchema,
  breadcrumbSchema,
  jsonLdScript,
} from "lib/schema";

export const metadata: Metadata = {
  title: "Mujo Baseball Hat · Wear the rebellion quietly",
  description:
    "The Mujo Baseball Hat. Embroidered Mujo mark, low-profile, adjustable. Wear the rebellion quietly. For people who switched and don't need to explain it. $25.",
  alternates: { canonical: "/products/mujo-hat" },
  openGraph: {
    type: "website",
    title: "Mujo Baseball Hat",
    description: "Wear the rebellion quietly.",
  },
};

export default function HatPdpPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            productSchema({
              url: "/products/mujo-hat",
              name: "Mujo Baseball Hat",
              description:
                "Embroidered Mujo mark, low-profile, adjustable strap. Unisex, one size. Made on demand.",
              image: "https://mujoworld.com/images/logo/mujo-logo-orange.png",
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
              { name: "Mujo Baseball Hat", url: "/products/mujo-hat" },
            ]),
          ),
        }}
      />
      <ImportedPage filename="merch_hat.html" />
    </>
  );
}
