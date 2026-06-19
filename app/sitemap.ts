import { baseUrl } from "lib/utils";
import type { MetadataRoute } from "next";

/**
 * Public sitemap. The /lemna landing is included (indexed early 2026-06-08 for
 * SEO runway ahead of the 2026-09-01 launch). The /lemna/shop + /products/lemna
 * spokes + /migrate + /api/* + /account/* stay excluded (blocked in robots.txt
 * too); they flip into the sitemap at the launch-day flip task.
 *
 * /journal/[slug] entries are added once Kinga migrates posts to
 * `content/journal/*.md`. Until then the dynamic route renders a placeholder.
 */
const PUBLIC_ROUTES: { path: string; changeFrequency?: "daily" | "weekly" | "monthly" | "yearly"; priority?: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/ritual", changeFrequency: "weekly", priority: 0.9 },
  { path: "/products/mujo-ritual", changeFrequency: "weekly", priority: 0.9 },
  { path: "/products/mujo-frother", changeFrequency: "weekly", priority: 0.7 },
  { path: "/products/mujo-tee", changeFrequency: "weekly", priority: 0.7 },
  { path: "/products/mujo-hat", changeFrequency: "weekly", priority: 0.7 },
  { path: "/products/mujo-crew", changeFrequency: "weekly", priority: 0.7 },
  { path: "/shop", changeFrequency: "weekly", priority: 0.8 },
  { path: "/lemna", changeFrequency: "weekly", priority: 0.8 },
  { path: "/ingredients", changeFrequency: "monthly", priority: 0.7 },
  { path: "/rebel-club", changeFrequency: "monthly", priority: 0.6 },
  { path: "/ambassador", changeFrequency: "monthly", priority: 0.5 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.4 },
  { path: "/journal", changeFrequency: "weekly", priority: 0.6 },
  { path: "/journal/page/2", changeFrequency: "weekly", priority: 0.4 },
  // Journal posts (migrated from the Shopify blog + science reads + podcast).
  { path: "/journal/the-story-of-coffee-from-divine-elixir-to-a-daily-brew-that-could-be-making-you-tired", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/what-you-need-to-know-about-functional-mushroom-active-compounds-and-beta-glucans", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/the-problem-with-resolutions-and-what-to-do-instead", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/introducing-mujo-the-coffee-alternative-thats-changing-the-game", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/founding-mujo-the-easiest-way-for-stress-to-not-work-against-you", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/what-bringing-mujo-to-market-taught-me", changeFrequency: "monthly", priority: 0.5 },
  { path: "/legal/cookies", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/returns", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/shipping", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/terms", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/accessibility", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/subscription-terms", changeFrequency: "yearly", priority: 0.2 },
  { path: "/legal/affiliate-disclosure", changeFrequency: "yearly", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date().toISOString();
  return PUBLIC_ROUTES.map((r) => ({
    url: `${baseUrl}${r.path}`,
    lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
