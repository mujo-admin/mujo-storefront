import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import {
  productSchema,
  breadcrumbSchema,
  jsonLdScript,
} from "lib/schema";

export const metadata: Metadata = {
  title: "Mujo Crew Neck Sweatshirt · The uniform of slow mornings",
  description:
    "The Mujo Crew Neck Sweatshirt — soft, unisex, intentionally designed. Bone and Sandstone. For people who wear their values as comfortably as their clothes. $40.",
  alternates: { canonical: "/products/mujo-crew" },
  openGraph: {
    type: "website",
    title: "Mujo Crew Neck Sweatshirt",
    description: "The uniform for the slow mornings that belong to you.",
  },
};

export default function CrewPdpPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            productSchema({
              url: "/products/mujo-crew",
              name: "Mujo Crew Neck Sweatshirt",
              description:
                "Unisex crew neck sweatshirt. 80% cotton / 20% polyester fleece, 100% cotton face. Medium-heavy weight. Bone or Sandstone.",
              image: "https://mujoworld.com/images/logo/mujo-logo-orange.png",
              lowPrice: "40",
              highPrice: "40",
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
              { name: "Mujo Crew Neck Sweatshirt", url: "/products/mujo-crew" },
            ]),
          ),
        }}
      />
      <ImportedPage filename="merch_crew.html" />
    </>
  );
}
