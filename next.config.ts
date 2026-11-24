import type { NextConfig } from "next";

// Content-Security-Policy, watch-only for now (2026-11-24).
//
// Sent as `Content-Security-Policy-Report-Only`: nothing is blocked. Each
// browser reports what WOULD be blocked to /api/csp-report, which writes one
// line per report to the server log ("[csp-report]"). Once the log is quiet
// for the services below, the same value moves to the enforcing header.
//
// No nonces on purpose: a nonce makes every page render per request, which
// would switch off prerendering and the CDN cache. The price is
// 'unsafe-inline' for scripts and styles (Next.js and the imported pages both
// rely on inline ones); the policy still limits WHERE scripts, frames and
// connections may come from.
//
// When a new outside service is added to the site, add its hosts here.
const CSP_SOURCES: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": [
    "'self'",
    "'unsafe-inline'",
    // Turbopack dev mode evaluates code; never in production.
    ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
    "https://js.stripe.com",
    "https://*.js.stripe.com",
    "https://www.googletagmanager.com",
    "https://connect.facebook.net",
    "https://static.klaviyo.com",
    "https://static-tracking.klaviyo.com",
    "https://loox.io",
    "https://*.loox.io",
    "https://analytics.ahrefs.com",
    "https://vercel.live",
  ],
  "style-src": [
    "'self'",
    "'unsafe-inline'",
    "https://fonts.googleapis.com",
    "https://api.fontshare.com",
    "https://static.klaviyo.com",
    "https://loox.io",
    "https://*.loox.io",
  ],
  "font-src": [
    "'self'",
    "data:",
    "https://fonts.gstatic.com",
    "https://cdn.fontshare.com",
    "https://static.klaviyo.com",
    "https://*.loox.io",
  ],
  // Pictures are low risk and come from many places (Shopify, Loox review
  // photos, Klaviyo forms, tracking pixels).
  "img-src": ["'self'", "data:", "blob:", "https:"],
  "media-src": ["'self'", "blob:", "https://cdn.shopify.com", "https://*.loox.io"],
  "connect-src": [
    "'self'",
    "https://api.stripe.com",
    "https://*.stripe.com",
    "https://m.stripe.network",
    "https://maps.googleapis.com",
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://*.analytics.google.com",
    "https://stats.g.doubleclick.net",
    "https://www.google.com",
    "https://www.facebook.com",
    "https://connect.facebook.net",
    "https://*.klaviyo.com",
    "https://loox.io",
    "https://*.loox.io",
    "https://analytics.ahrefs.com",
  ],
  "frame-src": [
    "'self'",
    "https://js.stripe.com",
    "https://*.js.stripe.com",
    "https://hooks.stripe.com",
    "https://www.facebook.com",
    "https://loox.io",
    "https://*.loox.io",
    "https://vercel.live",
  ],
  "worker-src": ["'self'", "blob:"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "report-uri": ["/api/csp-report"],
};
const CSP_REPORT_ONLY = Object.entries(CSP_SOURCES)
  .map(([directive, sources]) => `${directive} ${sources.join(" ")}`)
  .join("; ");

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
        // Baseline security headers on every page and API response.
        //  - frame-ancestors / X-Frame-Options: no other site may embed Mujo
        //    pages (clickjacking). Stripe's checkout is an iframe INSIDE our
        //    page, which this does not affect.
        //  - nosniff: browsers must not guess a file's type.
        //  - Referrer-Policy: other sites see only "mujoworld.com", never a
        //    full URL (checkout URLs carry session ids).
        //  - Permissions-Policy: the site never needs camera, microphone or
        //    location. Payment is deliberately NOT restricted (Apple/Google Pay).
        // The full Content-Security-Policy runs in REPORT-ONLY mode (see
        // CSP_SOURCES above): browsers block nothing, they only report what
        // the policy would have blocked to /api/csp-report.
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
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
  async rewrites() {
    return [
      // inlineCss puts next/font's CSS inline in each page, but its font URLs
      // stay relative ("../media/x.woff2"), so from /ritual or /products/... the
      // browser asks for /media/x.woff2 and gets a 404. Hanken Grotesk never
      // loaded on the live site because of this (found 2026-10-25 in the speed
      // pass). Serve those requests from the real build folder.
      {
        source: "/media/:file*",
        destination: "/_next/static/media/:file*",
      },
    ];
  },
  async redirects() {
    return [
      // /science retired 2026-06-19 (conventional-food path: no health-claim science page).
      // Redirect to /about, which now carries the "why Mujo." permanent:false so a future
      // replacement page can reclaim the path.
      {
        source: "/science",
        destination: "/about",
        permanent: false,
      },
      // Shopify Liquid → headless route map.
      // The old Shopify waitlist page. /lemna is now live + indexable (the earlier
      // noindex was lifted), so we redirect rather than 404 the link that lives in
      // emails / ads / the IG bio. permanent:false (307) keeps it changeable at the
      // launch-day flip without browsers hard-caching it.
      {
        source: "/pages/protein-bars-early-access",
        destination: "/protein-powder",
        permanent: false,
      },
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
      // Old Shopify addresses Google still holds (Search Console "Not found",
      // audited 2026-10-06). Each lands on the closest live page.
      { source: "/pages/about-us", destination: "/about", permanent: true },
      { source: "/pages/contact", destination: "/contact", permanent: true },
      { source: "/pages/avada-faqs", destination: "/contact#faq", permanent: true },
      { source: "/collections/:path+", destination: "/shop", permanent: true },
      { source: "/products/vitality-brew", destination: "/products/mujo-ritual", permanent: true },
      { source: "/products/mujo-hoodie", destination: "/shop", permanent: true },
      { source: "/blogs/news/tagged/:tag*", destination: "/journal", permanent: true },
      // More old Shopify addresses that still answered "not found" (audited
      // 2026-11-24: Ahrefs broken links + a link in our own terms page).
      { source: "/pages/ingredients", destination: "/ingredients", permanent: true },
      { source: "/policies/refund-policy", destination: "/legal/returns", permanent: true },
      { source: "/policies/privacy-policy", destination: "/legal/privacy", permanent: true },
      { source: "/policies/terms-of-service", destination: "/legal/terms", permanent: true },
      { source: "/policies/shipping-policy", destination: "/legal/shipping", permanent: true },
      { source: "/policies/subscription-policy", destination: "/legal/subscription-terms", permanent: true },
      { source: "/policies/contact-information", destination: "/contact", permanent: true },
      { source: "/cart", destination: "/shop", permanent: true },
      // Journal posts unpublished in the 2026-06 compliance sweep. Send them to
      // the journal index instead of a 404. permanent:false so a rewritten post
      // can reclaim its address: delete its line here when it is republished.
      { source: "/journal/caffeine-and-mental-health-what-s-the-buzz-really", destination: "/journal", permanent: false },
      { source: "/journal/morning-cortisol-spike-and-coffee", destination: "/journal", permanent: false },
      { source: "/journal/powdered-mushrooms-vs-extracts-and-the-ritual-of-potency", destination: "/journal", permanent: false },
      { source: "/journal/the-biology-of-burnout-and-why-caffeine-makes-it-worse", destination: "/journal", permanent: false },
      { source: "/journal/tired-but-wired", destination: "/journal", permanent: false },
      { source: "/journal/unlocking-vitality-the-journey-from-stress-to-energy", destination: "/journal", permanent: false },
      { source: "/journal/vagal-tone-and-composure", destination: "/journal", permanent: false },
      { source: "/journal/what-we-inherit-from-our-fathers-nervous-systems-stress-and-the-rituals-that-can-heal-them", destination: "/journal", permanent: false },
      { source: "/journal/what-you-actually-got-from-your-mama-besides-life-and-good-looks", destination: "/journal", permanent: false },
      { source: "/journal/what-your-body-actually-needs", destination: "/journal", permanent: false },
      { source: "/journal/why-you-crash-at-3pm", destination: "/journal", permanent: false },
      { source: "/journal/your-brain-can-grow-new-connections-this-mushroom-helps-it-do-that", destination: "/journal", permanent: false },
      { source: "/journal/your-gut-is-talking-to-your-brain-right-now", destination: "/journal", permanent: false },
      // Shopify product handle aliases. The Meta/Instagram catalog is synced
      // from Shopify, which publishes Shopify handles — not our headless
      // routes. Without these, a product tag on Instagram lands on a 404.
      // Audited 2026-09-27: 4 of 5 were dead. Keep in sync with the Shopify
      // product handles, not with our own route names.
      {
        source: "/products/the-ritual",
        destination: "/products/mujo-ritual",
        permanent: true,
      },
      {
        source: "/products/electric-frother",
        destination: "/products/mujo-frother",
        permanent: true,
      },
      {
        source: "/products/crew-neck-sweatshirt",
        destination: "/products/mujo-crew",
        permanent: true,
      },
      {
        source: "/products/mujo-t-shirt",
        destination: "/products/mujo-tee",
        permanent: true,
      },
      {
        source: "/products/mujo-baseball-hat",
        destination: "/products/mujo-hat",
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
      // ── Lemna BAR pages HIDDEN (Kinga 2026-09-30) ──
      // The bars moved later; the Protein Powder launched first. All three bar
      // routes forward to the powder landing. Sources stay in the repo
      // (content/imported-html/mujo_lemna_*.html, app/lemna/*, app/products/lemna)
      // so the bars can come back: delete these three redirects and restore the
      // homepage/shop/footer links. permanent:false (307) so nothing caches it.
      {
        source: "/lemna",
        destination: "/protein-powder",
        permanent: false,
      },
      // ── (history) Lemna pre-order pages hidden until pre-orders launch (2026-05-25) ──
      // The pre-order PDP (/products/lemna) and its shop spoke (/lemna/shop) are
      // parked until Kinga opens pre-orders. The /lemna landing stays live.
      // Source is preserved + editable at:
      //   content/imported-html/mujo_lemna_bar_shop_pdp.html
      //   (rendered by app/products/lemna/page.tsx)
      // TO UN-HIDE AT LAUNCH: delete these two redirects and restore the footer
      // "Lemna Bar" link to /products/lemna. permanent:false (307) so nothing
      // caches the hide.
      {
        source: "/products/lemna",
        destination: "/protein-powder",
        permanent: false,
      },
      {
        source: "/lemna/shop",
        destination: "/protein-powder",
        permanent: false,
      },
      // Old Shopify blog → headless journal. Migrated posts keep their exact
      // Shopify slugs (see app/journal/[slug]/page.tsx PUBLISHED map), so this
      // is a clean 1:1 redirect that preserves inbound-link SEO equity.
      {
        source: "/blogs/news/:slug",
        destination: "/journal/:slug",
        permanent: true,
      },
      {
        source: "/blogs/news",
        destination: "/journal",
        permanent: true,
      },
      // /account, /account/login*, /account/expired all live as real routes
      // post-Phase-3 (2026-05-07). Phase 5 fills out /account/{orders,
      // subscription, profile, payment-method}. No redirects needed.
    ];
  },
};

export default config;
