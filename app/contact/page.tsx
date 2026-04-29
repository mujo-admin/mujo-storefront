import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Contact · Mujo",
  description:
    "Send us a note. Real humans reply within a working day. hello@mujoworld.com.",
  alternates: { canonical: "/contact" },
};

const contactJsonLd = {
  "@context": "https://schema.org",
  "@type": "ContactPage",
  url: "https://mujoworld.com/contact",
  name: "Contact Mujo",
};

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactJsonLd) }}
      />
      <ImportedPage filename="mujo_contact.html" />
    </>
  );
}
