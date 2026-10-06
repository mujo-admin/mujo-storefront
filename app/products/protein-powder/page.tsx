import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { ProductAnalytics } from "components/integrations/product-analytics";
import type { Splice } from "lib/imported-html";
import { ProteinPdpClient } from "components/product/protein-pdp-client";
import {
  productSchema,
  breadcrumbSchema,
  jsonLdScript,
} from "lib/schema";

// Splice the source HTML's static buy box and sticky ATC out, leaving
// mount-point markers that <ProteinPdpClient /> targets via createPortal.
const PROTEIN_SPLICES: Splice[] = [
  {
    startSentinel: "MUJO_PROTEIN_BUYBOX_START",
    endSentinel: "MUJO_PROTEIN_BUYBOX_END",
    mountId: "protein-buybox",
  },
  {
    startSentinel: "MUJO_PROTEIN_STICKY_ATC_START",
    endSentinel: "MUJO_PROTEIN_STICKY_ATC_END",
    mountId: "protein-sticky-atc",
  },
];

const DESCRIPTION =
  "The first protein powder made with Lemna leaf. 22g of complete plant protein, 0g sugar and real Madagascar vanilla. Pre-order now, ships by November 15.";

export const metadata: Metadata = {
  title: "Plant-Based Protein Powder, Vanilla Bean",
  description: DESCRIPTION,
  alternates: { canonical: "/products/protein-powder" },
  openGraph: {
    type: "website",
    title: "Mujo Protein Powder",
    description: DESCRIPTION,
  },
};

export default function ProteinPdpPage() {
  return (
    <>
      <ProductAnalytics slug="protein-powder" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            productSchema({
              url: "/products/protein-powder",
              name: "Mujo Protein Powder, Vanilla Bean",
              description:
                "A plant-based protein powder made with Lemna leaf and yellow pea protein. 22g of protein and all nine essential amino acids per serving, 0g sugar, 120 calories, real Madagascar vanilla bean and monk fruit. Vegan, and free from gluten, dairy and soy. 450g pouch, 15 servings. Pre-order: ships by November 15, 2026.",
              image:
                "https://mujoworld.com/images/responsive/products/protein-powder/powder-pouch-front-2026-09-1200.webp",
              lowPrice: "45.00",
              highPrice: "45.00",
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
              { name: "Protein Powder", url: "/products/protein-powder" },
            ]),
          ),
        }}
      />
      <ImportedPage
        filename="mujo_protein_powder_pdp.html"
        splices={PROTEIN_SPLICES}
      />
      <ProteinPdpClient />
    </>
  );
}
