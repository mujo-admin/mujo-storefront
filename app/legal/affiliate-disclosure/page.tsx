import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Affiliate Disclosure · Mujo",
  description:
    "FTC § 16 CFR 255 affiliate disclosure. 15% commission on referred sales.",
  alternates: { canonical: "/legal/affiliate-disclosure" },
};

export default function AffiliateDisclosurePage() {
  return <ImportedPage filename="legal_affiliate_disclosure.html" />;
}
