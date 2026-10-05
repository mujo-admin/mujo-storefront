import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Subscription Terms",
  description:
    "4, 6, 8, or 12-week billing cycles, the 2-cycle minimum, and how to manage or cancel from your account.",
  alternates: { canonical: "/legal/subscription-terms" },
};

export default function SubscriptionTermsPage() {
  return <ImportedPage filename="legal_subscription_terms.html" />;
}
