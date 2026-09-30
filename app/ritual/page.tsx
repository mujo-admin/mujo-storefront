import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { webPageSchema, mujoBrand, jsonLdScript } from "lib/schema";

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
      <ImportedPage filename="mujo_ritual_cacao_landing_page.html" />
    </>
  );
}
