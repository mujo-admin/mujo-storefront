import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Journal · Protein, Mushrooms and Morning Rituals",
  description:
    "Plain-English explainers on protein, functional mushrooms, coffee and everyday rituals, from the Mujo kitchen.",
  alternates: { canonical: "/journal" },
};

export default function JournalIndexPage() {
  return <ImportedPage filename="mujo_journal.html" />;
}
