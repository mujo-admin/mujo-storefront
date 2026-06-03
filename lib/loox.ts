/**
 * Loox reviews — headless integration config + re-init helper.
 *
 * Loox (loox.io) is installed on the Shopify backend and collects reviews there.
 * On this headless storefront we display them via Loox's external-domain widgets:
 *   - full reviews feed:  <div id="looxReviews" data-product-id="{NUMERIC_ID}">
 *   - star rating badge:  <div class="loox-rating" data-fetch data-id="{NUMERIC_ID}">
 * The widget needs no API key — only the shop's myshopify domain.
 *
 * Both widget divs live as static markup inside the imported PDP HTML (no IDs
 * baked in). The numeric product ID is stamped on at runtime from the map below,
 * keyed by route slug, and Loox's script is (re)injected to render them.
 *
 * Why re-inject instead of a one-time global <script>: the storefront is a
 * single-page app (App Router client navigation), and Loox's script only scans
 * the DOM when it loads. Re-injecting on each PDP route forces a fresh scan so
 * the widget renders against the newly-navigated product — and scopes Loox to
 * PDP routes only (it never loads on non-product pages). loox.js is cached after
 * first load, so the re-fetch is effectively free.
 */

declare global {
  interface Window {
    loox?: unknown;
  }
}

export const LOOX_SHOP_DOMAIN = process.env.NEXT_PUBLIC_LOOX_SHOP_DOMAIN ?? "";

/**
 * Route slug → numeric Shopify product ID. Loox keys to the numeric product ID
 * (not the handle). Resolved from the Shopify Storefront API 2026-06-03.
 *   mujo-frother  → handle electric-frother
 *   mujo-crew     → handle crew-neck-sweatshirt
 *   mujo-tee      → handle mujo-t-shirt
 *   mujo-hat      → handle mujo-baseball-hat
 * Lemna is intentionally absent — added at the launch-day flip when it becomes
 * a purchasable Shopify product.
 */
export const LOOX_PRODUCT_IDS: Record<string, string> = {
  "mujo-ritual": "8855909597426",
  "mujo-frother": "8907228840178",
  "mujo-crew": "8918766354674",
  "mujo-tee": "8919013359858",
  "mujo-hat": "8931279110386",
};

/** `/products/<slug>` → `<slug>` if it has a Loox mapping, else undefined. */
export function looxSlugFromPathname(pathname: string): string | undefined {
  const slug = pathname.match(/^\/products\/([^/?#]+)/)?.[1];
  return slug && slug in LOOX_PRODUCT_IDS ? slug : undefined;
}

const LOOX_SCRIPT_ID = "loox-widget-js";

function injectLooxScript() {
  document.getElementById(LOOX_SCRIPT_ID)?.remove();
  const script = document.createElement("script");
  script.id = LOOX_SCRIPT_ID;
  script.async = true;
  script.src = `https://loox.io/widget/loox.js?shop=${LOOX_SHOP_DOMAIN}`;
  document.head.appendChild(script);
}

/**
 * Stamp the numeric product ID onto this page's Loox widget divs and (re)render.
 * Polls briefly for the widget markup (the imported HTML may commit a beat after
 * client navigation), then injects loox.js to scan + render. Safe no-op when the
 * shop domain is unset or the slug has no mapping.
 */
export function renderLooxForSlug(slug: string): void {
  if (typeof window === "undefined" || !LOOX_SHOP_DOMAIN) return;
  const productId = LOOX_PRODUCT_IDS[slug];
  if (!productId) return;

  let tries = 0;
  const tick = () => {
    const reviews = document.querySelectorAll<HTMLElement>("#looxReviews");
    const ratings = document.querySelectorAll<HTMLElement>(".loox-rating");
    if (reviews.length || ratings.length) {
      reviews.forEach((el) => el.setAttribute("data-product-id", productId));
      ratings.forEach((el) => {
        el.setAttribute("data-id", productId);
        if (!el.hasAttribute("data-fetch")) el.setAttribute("data-fetch", "");
      });
      injectLooxScript();
      return;
    }
    if (tries++ < 30) window.setTimeout(tick, 100); // up to ~3s
  };
  tick();
}
