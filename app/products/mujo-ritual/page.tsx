import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { ProductAnalytics } from "components/integrations/product-analytics";
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
  title: "The Ritual · Mushroom Coffee Alternative",
  description:
    "An organic mushroom coffee alternative that tastes like a smooth mocha, with a cacao undertone. Under 5mg of caffeine for calm energy, no crash.",
  alternates: { canonical: "/products/mujo-ritual" },
  openGraph: {
    type: "website",
    title: "The Ritual",
    description: "An organic mushroom coffee alternative that tastes like a smooth mocha, with a cacao undertone. Under 5mg of caffeine for calm energy, no crash.",
  },
};

export default function RitualPdpPage() {
  return (
    <>
      <ProductAnalytics itemId="mujo-ritual" itemName="The Ritual" price={65} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            productSchema({
              url: "/products/mujo-ritual",
              name: "The Ritual",
              description:
                "The Ritual is a warm coffee alternative made with organic Peruvian cacao, carob and four organic mushroom extracts. It tastes like a smooth mocha: roasted and coffee-like, with an undertone of cacao and a hint of Ceylon cinnamon. With under 5mg of caffeine, roughly a twentieth of a coffee, it's made for calm energy with no crash. Inside: organic lion's mane, chaga, cordyceps and golden oyster (never mycelium on grain), plus L-theanine, panax ginseng, gelatinized black maca, MCT oil, ginger, monk fruit and a pinch of sea salt. Froth into warm or hot water, then top with milk. 25 servings per pouch.",
              image:
                "https://mujoworld.com/images/logo/mujo-logo-orange.png",
              lowPrice: "65",
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
              { name: "The Ritual", url: "/products/mujo-ritual" },
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
