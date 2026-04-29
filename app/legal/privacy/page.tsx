import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Privacy Policy · Mujo",
  description: "How we collect, use, and protect your personal data.",
  alternates: { canonical: "/legal/privacy" },
};

export default function PrivacyPage() {
  return <ImportedPage filename="mujo_legal_privacy.html" />;
}
