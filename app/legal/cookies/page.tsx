import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Cookies Policy · Mujo",
  description: "How Mujo uses cookies and tracking technologies.",
  alternates: { canonical: "/legal/cookies" },
};

export default function CookiesPage() {
  return <ImportedPage filename="mujo_legal_cookies.html" />;
}
