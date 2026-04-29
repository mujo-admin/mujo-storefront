import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Returns Policy · Mujo",
  description: "Our 30-day returns policy.",
  alternates: { canonical: "/legal/returns" },
};

export default function ReturnsPage() {
  return <ImportedPage filename="mujo_legal_returns.html" />;
}
