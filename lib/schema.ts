/**
 * schema.org JSON-LD generators per route.
 * Imported by page files; output goes inside a <script type="application/ld+json">.
 */

const SITE_URL = "https://mujoworld.com";

export const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Mujo",
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/shop?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
} as const;

export const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Mujo",
  url: SITE_URL,
  logo: `${SITE_URL}/images/logo/mujo-logo-orange.png`,
  email: "hello@mujoworld.com",
  sameAs: [
    "https://instagram.com/mujoworld",
    "https://tiktok.com/@mujoworld",
  ],
} as const;

export const mujoBrand = {
  "@type": "Brand",
  name: "Mujo",
  url: SITE_URL,
  logo: `${SITE_URL}/images/logo/mujo-logo-orange.png`,
} as const;

export function webPageSchema(args: {
  url: string;
  name: string;
  description: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    url: `${SITE_URL}${args.url}`,
    name: args.name,
    description: args.description,
    isPartOf: { "@type": "WebSite", name: "Mujo", url: SITE_URL },
    primaryImageOfPage: `${SITE_URL}/images/logo/mujo-logo-orange.png`,
    publisher: organizationSchema,
  };
}

export function collectionPageSchema(args: {
  url: string;
  name: string;
  description: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    url: `${SITE_URL}${args.url}`,
    name: args.name,
    description: args.description,
    isPartOf: { "@type": "WebSite", name: "Mujo", url: SITE_URL },
    publisher: organizationSchema,
  };
}

export function productSchema(args: {
  url: string;
  name: string;
  description: string;
  image: string;
  lowPrice: string;
  highPrice: string;
  currency?: string;
  inStock?: boolean;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: args.name,
    description: args.description,
    image: args.image,
    brand: mujoBrand,
    offers: {
      "@type": "AggregateOffer",
      url: `${SITE_URL}${args.url}`,
      priceCurrency: args.currency ?? "USD",
      lowPrice: args.lowPrice,
      highPrice: args.highPrice,
      availability:
        args.inStock === false
          ? "https://schema.org/PreOrder"
          : "https://schema.org/InStock",
    },
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: `${SITE_URL}${item.url}`,
    })),
  };
}

export function articleSchema(args: {
  url: string;
  headline: string;
  description: string;
  datePublished?: string;
  authorName?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}${args.url}` },
    headline: args.headline,
    description: args.description,
    image: `${SITE_URL}/images/logo/mujo-logo-orange.png`,
    author: {
      "@type": "Person",
      name: args.authorName ?? "Kinga",
    },
    publisher: organizationSchema,
    ...(args.datePublished ? { datePublished: args.datePublished } : {}),
  };
}

export function jsonLdScript(schema: unknown): string {
  return JSON.stringify(schema);
}
