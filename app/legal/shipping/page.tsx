import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Shipping Policy · Mujo",
  description: "Shipping rates, timelines, and customs disclosure.",
  alternates: { canonical: "/legal/shipping" },
};

export default function ShippingPage() {
  return <ImportedPage filename="mujo_legal_shipping.html" />;
}
