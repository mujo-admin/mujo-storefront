import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "About · Mujo",
  description:
    "Mujo was built by Kinga. The story behind stubborn standards, family origins, and modern performance without the crash.",
  alternates: { canonical: "/about" },
};

const aboutJsonLd = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  url: "https://mujoworld.com/about",
  name: "About Mujo",
};

export default function AboutPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }}
      />
      <ImportedPage filename="mujo_about.html" />
    </>
  );
}
