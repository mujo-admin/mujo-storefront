import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { PaperGrain } from "components/primitives/paper-grain";

export const metadata: Metadata = {
  title:
    "The Science of Mujo · How your foundation determines your performance",
  description:
    "Nervous system, cortisol, mitochondria. The science behind the Mujo Ritual.",
  alternates: { canonical: "/science" },
};

export default function SciencePage() {
  return (
    <>
      <PaperGrain />
      <ImportedPage filename="mujo_science_page_v2.html" />
    </>
  );
}
