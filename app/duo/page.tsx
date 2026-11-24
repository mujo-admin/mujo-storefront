import type { Metadata } from "next";
import { DuoClient } from "components/duo/duo-client";

// The Black Friday 2026 offer page. Linked from the emails and, from Friday,
// the top bar. A short-lived page: kept out of search and out of the sitemap.
// Rules and dates: lib/duo-offer.ts.
export const metadata: Metadata = {
  title: "The Daily Ritual Duo",
  description:
    "The Ritual and the Protein Powder together for $89, with a free frother and free shipping. Until November 30.",
  robots: { index: false, follow: false },
};

export default function DuoPage() {
  return <DuoClient />;
}
