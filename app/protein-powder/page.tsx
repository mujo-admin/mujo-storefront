import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { webPageSchema, mujoBrand, jsonLdScript } from "lib/schema";

const DESCRIPTION =
  "Meet Mujo Protein Powder: the first protein powder made with Lemna leaf. 22g of complete plant protein, 0g sugar, blended creamy like a milkshake. Pre-order now.";

export const metadata: Metadata = {
  title: "Plant-Based Protein Powder Made With Lemna Leaf",
  description: DESCRIPTION,
  alternates: { canonical: "/protein-powder" },
  openGraph: {
    type: "website",
    title: "Mujo Protein Powder",
    description: DESCRIPTION,
  },
};

export default function ProteinLandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            webPageSchema({
              url: "/protein-powder",
              name: "Mujo Protein Powder",
              description: DESCRIPTION,
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript({ "@context": "https://schema.org", ...mujoBrand }),
        }}
      />
      <ImportedPage filename="mujo_protein_powder_landing.html" />
    </>
  );
}
