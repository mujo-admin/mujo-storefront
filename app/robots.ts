import { baseUrl } from "lib/utils";
import type { MetadataRoute } from "next";

/**
 * robots.txt — Lemna trio + /migrate + /api/* + /account/* are blocked.
 * Lemna paths get unblocked on launch day flip (~6 weeks post-cutover).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/lemna",
          "/lemna/shop",
          "/products/lemna",
          "/migrate",
          "/api/",
          "/account/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
