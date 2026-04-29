import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Terms of Service · Mujo",
  description: "The terms of using Mujo's website and products.",
  alternates: { canonical: "/legal/terms" },
};

export default function TermsPage() {
  return <ImportedPage filename="mujo_legal_terms.html" />;
}
