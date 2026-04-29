import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    ppr: true,
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
