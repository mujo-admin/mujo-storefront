import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Accessibility · Mujo",
  description: "Mujo's commitment to WCAG 2.1 AA accessibility.",
  alternates: { canonical: "/legal/accessibility" },
};

export default function AccessibilityPage() {
  return <ImportedPage filename="legal_accessibility.html" />;
}
