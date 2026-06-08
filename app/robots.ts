import { headers } from "next/headers";
import { baseUrl } from "lib/utils";
import type { MetadataRoute } from "next";

/**
 * robots.txt — host-aware.
 *
 * ONLY the production domain (mujoworld.com) is allowed to be indexed. Every
 * other host — the staging alias (mujo-storefront.vercel.app), preview deploys,
 * localhost — returns a blanket `Disallow: /` so search engines never index
 * them. This prevents the staging site from competing with mujoworld.com as
 * duplicate content and from leaking pre-launch pages.
 *
 * It flips to the real rules automatically the moment the request host is
 * mujoworld.com at cutover — no code change needed on launch day.
 *
 * On the production host: Lemna trio + /migrate + /api/* + /account/* stay
 * blocked. The Lemna paths get unblocked on the launch-day flip.
 */
const PRODUCTION_HOST = "mujoworld.com";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? new URL(baseUrl).host;
  const isProduction = host === PRODUCTION_HOST || host === `www.${PRODUCTION_HOST}`;

  if (!isProduction) {
    // Non-production host — never index.
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

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
