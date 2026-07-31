import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import {
  websiteSchema,
  organizationSchema,
  jsonLdScript,
} from "lib/schema";

export const metadata: Metadata = {
  title: "Mujo · Modern performance without the crash",
  description:
    "A functional mushroom coffee alternative. Caffeine-light, fruiting body only, for people who read the label.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    title: "Mujo · Modern performance without the crash",
    description:
      "A functional mushroom coffee alternative. Caffeine-light, fruiting body only, for people who read the label.",
  },
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(websiteSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(organizationSchema) }}
      />
      <ImportedPage filename="mujo_homepage.html" />
    </>
  );
}
