import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Journal · Mujo",
  description:
    "Field notes on rituals, recovery, motherhood, and modern performance.",
  alternates: { canonical: "/journal" },
};

export default function JournalIndexPage() {
  return <ImportedPage filename="mujo_journal.html" />;
}
