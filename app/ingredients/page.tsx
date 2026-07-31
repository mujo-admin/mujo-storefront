import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Ingredients · Mujo · What's inside, and why",
  description:
    "The Mujo ingredient dossier. Lion's mane, cordyceps, chaga, golden oyster, panax ginseng, L-theanine and turmeric extract. Every ingredient named openly, never hidden in a blend.",
  alternates: { canonical: "/ingredients" },
};

export default function IngredientsPage() {
  return <ImportedPage filename="mujo_ingredients.html" />;
}
