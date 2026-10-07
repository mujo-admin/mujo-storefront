import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import {
  productSchema,
  breadcrumbSchema,
  jsonLdScript,
} from "lib/schema";

export const metadata: Metadata = {
  title: "The Lemna Bar · Founding Member · Mujo",
  description:
    "Reserve a 250-spot founding member slot for the Lemna Bar. Limited release.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/products/lemna" },
};

export default function LemnaPdpPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            productSchema({
              url: "/products/lemna",
              name: "The Lemna Bar",
              description:
                "Premium clean-label protein bar. 15g plant protein. 250 founding member spots.",
              image: "https://mujoworld.com/images/logo/mujo-logo-orange.png",
              lowPrice: "0",
              highPrice: "0",
              inStock: false,
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
              { name: "Lemna", url: "/lemna" },
              { name: "Lemna Bar", url: "/products/lemna" },
            ]),
          ),
        }}
      />
      <ImportedPage filename="mujo_lemna_bar_shop_pdp.html" />
    </>
  );
}
