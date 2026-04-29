import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Subscription Terms · Mujo",
  description: "30-day cycle, Stripe Billing Portal, and dunning policy.",
  alternates: { canonical: "/legal/subscription-terms" },
};

export default function SubscriptionTermsPage() {
  return <ImportedPage filename="legal_subscription_terms.html" />;
}
