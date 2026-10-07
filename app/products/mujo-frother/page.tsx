import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { ProductAnalytics } from "components/integrations/product-analytics";
import {
  productSchema,
  breadcrumbSchema,
  jsonLdScript,
} from "lib/schema";

export const metadata: Metadata = {
  title: "Electric Frother · Rechargeable Milk Frother",
  description:
    "A slim rechargeable frother that makes your Ritual silky in about ten seconds. Double-spring whisk and a cap that covers it. Rinse and go.",
  alternates: { canonical: "/products/mujo-frother" },
  openGraph: {
    type: "website",
    title: "Electric Frother",
    description: "A slim rechargeable frother that makes your Ritual silky in about ten seconds. Double-spring whisk and a cap that covers it. Rinse and go.",
  },
};

export default function FrotherPdpPage() {
  return (
    <>
      <ProductAnalytics slug="mujo-frother" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            productSchema({
              url: "/products/mujo-frother",
              name: "Electric Frother",
              description:
                "A slim, rechargeable wand frother that makes your Ritual silky in about ten seconds. The double-spring whisk blends cacao and mushrooms smoothly into warm milk, with no clumps. A cap slides over the whisk so it stays clean in a drawer or a bag. It spins at 9,000 to 12,000 RPM and lasts up to 50 uses per charge. Rinse it in warm water and it's ready for tomorrow. Works in any mug, hot or iced.",
              image: "https://mujoworld.com/images/logo/mujo-logo-terracotta.png",
              lowPrice: "20",
              highPrice: "20",
              inStock: true,
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbSchema([
              { name: "Shop", url: "/shop" },
              { name: "Electric Frother", url: "/products/mujo-frother" },
            ]),
          ),
        }}
      />
      <ImportedPage filename="merch_frother.html" />
    </>
  );
}
