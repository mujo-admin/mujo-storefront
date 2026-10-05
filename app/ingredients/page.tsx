import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Ingredients · The Ritual & Protein Powder",
  description:
    "Every ingredient in the Ritual and the Protein Powder, named openly: organic mushroom extracts, cacao, L-theanine, Lemna leaf and yellow pea protein.",
  alternates: { canonical: "/ingredients" },
};

export default function IngredientsPage() {
  return <ImportedPage filename="mujo_ingredients.html" />;
}
