import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { ProductAnalytics } from "components/integrations/product-analytics";
import { RitualPdpClient } from "components/product/ritual-pdp-client";
import type { Splice } from "lib/imported-html";
import { webPageSchema, mujoBrand, jsonLdScript } from "lib/schema";

// The paid-traffic landing page carries the real Ritual buy box (same component
// as the PDP), mounted into these markers so visitors can buy without a second page.
const RITUAL_LANDING_SPLICES: Splice[] = [
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
  title: "A Coffee Alternative Without the Jitters",
  description:
    "Meet the Ritual: a mushroom cacao that tastes like a smooth mocha, with under 5mg of caffeine. The morning that doesn't start with a jolt.",
  alternates: { canonical: "/ritual" },
  openGraph: {
    type: "website",
    title: "The Ritual",
    description: "Meet the Ritual: a mushroom cacao that tastes like a smooth mocha, with under 5mg of caffeine. The morning that doesn't start with a jolt.",
  },
};

export default function RitualLandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            webPageSchema({
              url: "/ritual",
              name: "Mujo Ritual landing",
              description:
                "Caffeine-light mushroom coffee alternative for steady energy. No crash.",
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
      <ProductAnalytics slug="mujo-ritual" />
      <ImportedPage
        filename="mujo_ritual_cacao_landing_page.html"
        splices={RITUAL_LANDING_SPLICES}
      />
      <RitualPdpClient />
    </>
  );
}
