import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Shipping Policy",
  description: "Shipping rates and delivery times for orders within the United States.",
  alternates: { canonical: "/legal/shipping" },
};

export default function ShippingPage() {
  return <ImportedPage filename="mujo_legal_shipping.html" />;
}
