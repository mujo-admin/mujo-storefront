import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title:
    "The Rebel Club · For people who rebel against wellness theatre · Mujo",
  description:
    "Mujo's community for people who read the label. Founder notes. No sponsorship gimmicks.",
  alternates: { canonical: "/rebel-club" },
};

export default function RebelClubPage() {
  return <ImportedPage filename="mujo_rebel_club.html" />;
}
