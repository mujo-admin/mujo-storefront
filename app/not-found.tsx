import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";

export const metadata: Metadata = {
  title: "Page not found · Mujo",
  description: "Link broken, mistyped, or moved. Try one of the suggestions.",
};

export default function NotFound() {
  return <ImportedPage filename="mujo_404.html" />;
}
