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
  { path: "/science", changeFrequency: "monthly", priority: 0.7 },
  { path: "/rebel-club", changeFrequency: "monthly", priority: 0.6 },
  { path: "/ambassador", changeFrequency: "monthly", priority: 0.5 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.4 },
  { path: "/journal", changeFrequency: "weekly", priority: 0.6 },
  { path: "/journal/page/2", changeFrequency: "weekly", priority: 0.4 },
  // Journal posts (migrated from the Shopify blog + science reads + podcast).
  { path: "/journal/what-your-body-actually-needs", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/your-gut-is-talking-to-your-brain-right-now", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/your-brain-can-grow-new-connections-this-mushroom-helps-it-do-that", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/the-biology-of-burnout-and-why-caffeine-makes-it-worse", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/caffeine-and-mental-health-what-s-the-buzz-really", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/the-story-of-coffee-from-divine-elixir-to-a-daily-brew-that-could-be-making-you-tired", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/powdered-mushrooms-vs-extracts-and-the-ritual-of-potency", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/what-you-need-to-know-about-functional-mushroom-active-compounds-and-beta-glucans", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/unlocking-vitality-the-journey-from-stress-to-energy", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/what-you-actually-got-from-your-mama-besides-life-and-good-looks", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/what-we-inherit-from-our-fathers-nervous-systems-stress-and-the-rituals-that-can-heal-them", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/the-problem-with-resolutions-and-what-to-do-instead", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/introducing-mujo-the-coffee-alternative-thats-changing-the-game", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/founding-mujo-the-easiest-way-for-stress-to-not-work-against-you", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/what-bringing-mujo-to-market-taught-me", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/why-you-crash-at-3pm", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/morning-cortisol-spike-and-coffee", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/tired-but-wired", changeFrequency: "monthly", priority: 0.5 },
  { path: "/journal/vagal-tone-and-composure", changeFrequency: "monthly", priority: 0.5 },
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
