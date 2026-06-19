import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Ingredients · Mujo · What's inside, and why",
  description:
    "The Mujo ingredient dossier. Lion's mane, cordyceps, chaga, rhodiola, ashwagandha, and a bioavailable curcumin, each named openly on the label.",
  alternates: { canonical: "/ingredients" },
};

export default function IngredientsPage() {
  return <ImportedPage filename="mujo_ingredients.html" />;
}
