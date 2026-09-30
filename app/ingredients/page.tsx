import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Ingredients · What's Inside the Ritual",
  description:
    "Every ingredient in the Ritual, named openly: organic lion's mane, chaga, cordyceps and golden oyster, L-theanine, panax ginseng, cacao and carob.",
  alternates: { canonical: "/ingredients" },
};

export default function IngredientsPage() {
  return <ImportedPage filename="mujo_ingredients.html" />;
}
