import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { webPageSchema, mujoBrand, jsonLdScript } from "lib/schema";

export const metadata: Metadata = {
  title: "The Lemna Bar · Mujo · Founding Member Access",
  description:
    "A new clean-label protein bar from Mujo. Founding member access. Limited to 250.",
  // Indexed early (2026-06-08) to build SEO runway + capture waitlist signups
  // ahead of the 2026-09-01 launch. The /lemna/shop + /products/lemna spokes
  // stay noindex/parked until the launch-day flip.
  alternates: { canonical: "/lemna" },
};

export default function LemnaLandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            webPageSchema({
              url: "/lemna",
              name: "The Lemna Bar by Mujo",
              description:
                "A new clean-label protein bar from Mujo. Founding member access.",
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
      <ImportedPage filename="mujo_lemna_landing_page.html" />
    </>
  );
}
