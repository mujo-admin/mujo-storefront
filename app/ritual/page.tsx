import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { webPageSchema, mujoBrand, jsonLdScript } from "lib/schema";

export const metadata: Metadata = {
  title: "Mujo Ritual · The morning ritual for people who read the label",
  description:
    "Caffeine-free mushroom cacao with Lion's Mane, Cordyceps, Chaga, KSM-66, Rhodiola, Curcumin. Steady energy. No crash.",
  alternates: { canonical: "/ritual" },
  openGraph: {
    type: "website",
    title: "Mujo Ritual · The morning ritual",
    description:
      "Caffeine-free mushroom cacao for steady energy. No crash. Read the label.",
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
                "Caffeine-free mushroom cacao for steady energy. No crash.",
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
      <ImportedPage filename="mujo_ritual_cacao_landing_page.html" />
    </>
  );
}
