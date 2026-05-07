import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    ppr: true,
    // inlineCss kept on (Vercel Commerce default). Tested both settings;
    // inlineCss=false dropped HTML payload from 728KB → 312KB but added a
    // critical-path CSS fetch that hurt FCP equally. Net wash for now.
    // The real perf ceiling is the imported-HTML <style> blocks bloating
    // every <ImportedPage /> route — fixable via per-page JSX refactor
    // (see lighthouse-pre-cutover.md "Surgical refactors of high-traffic
    // pages" follow-up).
    inlineCss: true,
    useCache: true,
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
        pathname: "/s/files/**",
      },
      {
        protocol: "https",
        hostname: "static.klaviyo.com",
      },
      {
        protocol: "https",
        hostname: "d3hw6dc1ow8pp2.cloudfront.net",
      },
    ],
  },
  async headers() {
    return [
      {
        // Self-hosted fonts in public/fonts/ — cache aggressively.
        // Filenames don't change, so 1-year cache is safe.
        source: "/fonts/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Shopify Liquid → headless route map.
      // The /pages/protein-bars-early-access → /lemna redirect is added at the
      // launch-day flip (currently /lemna is noindex; redirecting to it pre-launch
      // would broadcast the URL via cached redirect metadata).
      {
        source: "/pages/ritual",
        destination: "/ritual",
        permanent: true,
      },
      {
        source: "/pages/about",
        destination: "/about",
        permanent: true,
      },
      {
        source: "/pages/faq",
        destination: "/contact#faq",
        permanent: true,
      },
      {
        source: "/collections/all",
        destination: "/shop",
        permanent: true,
      },
      // Shopify product handle alias.
      {
        source: "/products/the-ritual",
        destination: "/products/mujo-ritual",
        permanent: true,
      },
      // Old Liquid policies → /legal/* canon.
      {
        source: "/policies/privacy",
        destination: "/legal/privacy",
        permanent: true,
      },
      {
        source: "/policies/terms",
        destination: "/legal/terms",
        permanent: true,
      },
      {
        source: "/policies/shipping",
        destination: "/legal/shipping",
        permanent: true,
      },
      {
        source: "/policies/returns",
        destination: "/legal/returns",
        permanent: true,
      },
      {
        source: "/policies/cookies",
        destination: "/legal/cookies",
        permanent: true,
      },
      // /affiliate (legacy public route) → /ambassador public sales page.
      {
        source: "/affiliate",
        destination: "/ambassador",
        permanent: true,
      },
      // /account, /account/login*, /account/expired all live as real routes
      // post-Phase-3 (2026-05-07). Phase 5 fills out /account/{orders,
      // subscription, profile, payment-method}. No redirects needed.
    ];
  },
};

export default config;
