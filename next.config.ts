import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    ppr: true,
    // inlineCss disabled 2026-04-29: HTML payloads ballooned to 720+ KB
    // because imported-HTML <style> blocks were getting inlined too. With
    // 728KB payloads, mobile 3G/4G takes 2-3s just to download HTML before
    // parsing begins (FCP 2.5s, LCP 7-8s). External CSS is lighter on the
    // critical path and parallelizes with HTML fetch over HTTP/2.
    inlineCss: false,
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
      // Customer accounts go dark at cutover; v2 plan ports the 5 account HTMLs.
      {
        source: "/account",
        destination: "/",
        permanent: false,
      },
      {
        source: "/account/:path*",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

export default config;
