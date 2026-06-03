import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import type { Splice } from "lib/imported-html";
import { RitualPdpClient } from "components/product/ritual-pdp-client";
import {
  productSchema,
  breadcrumbSchema,
  jsonLdScript,
} from "lib/schema";

// Splice the source HTML's dead JS-driven buy box and sticky ATC out, leaving
// mount-point markers that <RitualPdpClient /> targets via createPortal.
const RITUAL_SPLICES: Splice[] = [
  {
    startSentinel: "MUJO_RITUAL_BUYBOX_START",
    endSentinel: "MUJO_RITUAL_BUYBOX_END",
    mountId: "ritual-buybox",
  },
  {
    startSentinel: "MUJO_RITUAL_STICKY_ATC_START",
    endSentinel: "MUJO_RITUAL_STICKY_ATC_END",
    mountId: "ritual-sticky-atc",
  },
];

export const metadata: Metadata = {
  title: "The Mujo Ritual · Mushroom Cacao",
  description:
    "Premium mushroom cacao adaptogen ritual. 25 servings. Subscribe and save 25%.",
  alternates: { canonical: "/products/mujo-ritual" },
  openGraph: {
    type: "website",
    title: "The Mujo Ritual",
    description: "Premium mushroom cacao adaptogen ritual.",
  },
};

export default function RitualPdpPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            productSchema({
              url: "/products/mujo-ritual",
              name: "The Mujo Ritual",
              description:
                "Premium caffeine-free mushroom cacao with Lion's Mane, Cordyceps, Chaga, KSM-66 Ashwagandha, RhodioLife Rhodiola, Longvida Curcumin.",
              image:
                "https://mujoworld.com/images/logo/mujo-logo-orange.png",
              lowPrice: "27",
              highPrice: "65",
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
              { name: "Mujo Ritual", url: "/products/mujo-ritual" },
            ]),
          ),
        }}
      />
      <ImportedPage
        filename="ritual_cacao_shop_pdp.html"
        splices={RITUAL_SPLICES}
      />
      <RitualPdpClient />
    </>
  );
}
