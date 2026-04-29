import { baseUrl } from "lib/utils";
import type { MetadataRoute } from "next";

/**
 * Public sitemap. Lemna trio + /migrate + /api/* + /account/* are excluded —
 * those are blocked in robots.txt as well. Lemna routes flip into the sitemap
 * at the launch-day flip task (see plans/lemna-launch-day-flip.md stub).
 *
 * /journal/[slug] entries are added once Kinga migrates posts to
 * `content/journal/*.md`. Until then the dynamic route renders a placeholder.
 */
const PUBLIC_ROUTES: { path: string; changeFrequency?: "daily" | "weekly" | "monthly" | "yearly"; priority?: number }[] = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/ritual", changeFrequency: "weekly", priority: 0.9 },
  { path: "/products/mujo-ritual", changeFrequency: "weekly", priority: 0.9 },
  { path: "/shop", changeFrequency: "weekly", priority: 0.8 },
  { path: "/ingredients", changeFrequency: "monthly", priority: 0.7 },
  { path: "/science", changeFrequency: "monthly", priority: 0.7 },
  { path: "/rebel-club", changeFrequency: "monthly", priority: 0.6 },
  { path: "/ambassador", changeFrequency: "monthly", priority: 0.5 },
  { path: "/about", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.4 },
  { path: "/journal", changeFrequency: "weekly", priority: 0.6 },
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
