import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Ingredients · Mujo · Every dose disclosed, every source cited",
  description:
    "The Mujo ingredient dossier. Lion's Mane, Cordyceps, Chaga, KSM-66, RhodioLife, Longvida — clinical doses, label-readable.",
  alternates: { canonical: "/ingredients" },
};

export default function IngredientsPage() {
  return <ImportedPage filename="mujo_ingredients.html" />;
}
