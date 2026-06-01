/**
 * Server-side helper that reads an HTML file from
 * `content/imported-html/{filename}` and extracts:
 *
 *   - the inline page-specific <style> blocks (with the global `:root {}` block
 *     stripped, since tokens are now in app/styles/tokens.css);
 *   - the inner body content with the duplicated chrome stripped (announcement
 *     bar, sticky nav, mobile-menu drawer, cart drawer, footer — all of those
 *     now live in the root layout via <SiteHeader /> + <Footer />).
 *
 * CTAs and form embeds are tagged with `data-mujo-action="..."` /
 * `data-mujo-klaviyo-form-id="..."` so the client-side wrapper can wire them
 * to /api/checkout, the cart drawer, and Klaviyo without rewriting the markup
 * for every page.
 *
 * This is the mechanical-port path. High-traffic pages (Ritual landing,
 * Ritual PDP, Lemna landing) get surgical JSX refactors post-cutover.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

const CONTENT_DIR = path.join(process.cwd(), "content", "imported-html");

export type ImportedHtml = {
  /** Page-specific CSS, ready to drop into a `<style>` tag. */
  styles: string;
  /** Inner body markup. Already deduped against layout-level chrome. */
  body: string;
};

export type Splice = {
  /** Sentinel comment marking start of region to remove (e.g. "MUJO_RITUAL_BUYBOX_START"). */
  startSentinel: string;
  /** Sentinel comment marking end of region to remove. */
  endSentinel: string;
  /** Replacement marker the client component will mount into via Portal. */
  mountId: string;
};

export type LoadOptions = {
  /**
   * Replace sentinel-bracketed regions with `<div data-mujo-mount="..."></div>`
   * markers. Used for high-traffic pages that need React-controlled subsections
   * (e.g. the Ritual PDP buy box) without rewriting the full page in JSX.
   */
  splices?: Splice[];
};

/** Strip blocks matching a regex; keep everything else verbatim. */
function strip(source: string, re: RegExp): string {
  return source.replace(re, "");
}

/** Strip patterns specific to the imported HTMLs. */
function dedupeChrome(html: string): string {
  return [
    [/<div\s+class="announce"[\s\S]*?<\/div>/, ""],
    [/<nav[\s\S]*?class="mujo-nav"[\s\S]*?<\/nav>/, ""],
    [/<aside[^>]*class="mobile-menu"[\s\S]*?<\/aside>/, ""],
    [/<aside[^>]*class="cart-drawer"[\s\S]*?<\/aside>/, ""],
    [/<div[^>]*class="menu-overlay"[\s\S]*?<\/div>/, ""],
    [/<footer[^>]*class="mujo-foot"[\s\S]*?<\/footer>/, ""],
    // Merch PDP template chrome (different class names than the original imports).
    [/<div\s+class="announcement"[\s\S]*?<\/div>/, ""],
    [/<nav\s+class="nav"[\s\S]*?<\/nav>/, ""],
    [/<div\s+class="breadcrumb"[\s\S]*?<\/div>/, ""],
    [/<script[\s\S]*?<\/script>/g, ""],
    // Note: the static `.quiz-pill` button + `.qs-overlay` modal in the
    // source HTMLs stay opacity:0/pointer-events:none by default (they only
    // animated in via the stripped <script>). They're invisible dead
    // markup. The React <QuizPill /> + <QuizSheet /> render on top.
  ].reduce<string>((acc, [re, sub]) => acc.replace(re as RegExp, sub as string), html);
}

/** Drop the global :root {} block from inline <style>; tokens are global now. */
function stripRootBlock(css: string): string {
  return css.replace(/:root\s*\{[\s\S]*?\}/, "");
}

/** Tag CTAs and Klaviyo form slots with data-mujo-* hooks for client wiring. */
function tagInteractionHooks(html: string): string {
  return html
    .replace(/onclick="checkout\(\)"/g, 'data-mujo-action="checkout"')
    .replace(/onclick="openCart\(\)"/g, 'data-mujo-action="open-cart"')
    .replace(/onclick="openMenu\(\)"/g, 'data-mujo-action="open-menu"')
    .replace(/onclick="closeAll\(\)"/g, 'data-mujo-action="close-all"')
    .replace(/onclick="closeMenu\(\)"/g, 'data-mujo-action="close-menu"')
    .replace(/onclick="closeCart\(\)"/g, 'data-mujo-action="close-cart"')
    // Quiz triggers — both standalone and the mobile-menu compound form.
    .replace(/onclick="closeMenu\(\);\s*openQuizSheet\(\);\s*return false;"/g, 'data-mujo-action="open-quiz"')
    .replace(/onclick="openQuizSheet\(\)"/g, 'data-mujo-action="open-quiz"')
    .replace(/onclick="addToCart\(([^)]*)\)"/g, 'data-mujo-action="add-to-cart" data-mujo-args="$1"')
    // Signup forms wired to the live runtime (SIGNUP_FORMS in
    // imported-page-runtime.tsx). Specific rules MUST precede the generic
    // catch-all below so they win the rewrite.
    .replace(/onsubmit="handleJoin\(event\)"/g, 'data-mujo-form="rebel-club"')
    .replace(/onsubmit="return submit(?:HeroForm|FinalCta)\(event\);"/g, 'data-mujo-form="lemna-waitlist"')
    // Any other inline onsubmit is made inert: the runtime preventDefaults
    // data-mujo-form="generic" (the original handler <script> was stripped, so
    // leaving the attribute would either throw or trigger a native page reload).
    .replace(/onsubmit="[^"]*"/g, 'data-mujo-form="generic"')
    .replace(/Mujo_logo_orange\.png/g, "/images/logo/mujo-logo-orange.png")
    // Old Shopify-Liquid collection URL used in merch breadcrumbs / nav links.
    // Breadcrumbs are stripped above, but rewrite defensively for any survivors.
    .replace(/\/collections\/mujo-performance/g, "/shop");
}

/** Pull all <style>...</style> blocks out of the head/body. */
function extractStyles(html: string): { styles: string; rest: string } {
  const styles: string[] = [];
  const rest = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/g, (_match, css) => {
    styles.push(stripRootBlock(css));
    return "";
  });
  return { styles: styles.join("\n"), rest };
}

/** Pull just the inside of <body>...</body>. */
function extractBody(html: string): string {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return m?.[1] ?? html;
}

/**
 * Apply sentinel-based splices: replace each `<!-- start -->...<!-- end -->`
 * region with a single `<div data-mujo-mount="...">` marker that a client
 * component can target via Portal.
 */
function applySplices(html: string, splices: Splice[]): string {
  return splices.reduce((acc, { startSentinel, endSentinel, mountId }) => {
    const pattern = new RegExp(
      `<!--\\s*${startSentinel}\\s*-->[\\s\\S]*?<!--\\s*${endSentinel}\\s*-->`,
    );
    return acc.replace(pattern, `<div data-mujo-mount="${mountId}"></div>`);
  }, html);
}

export async function loadImportedHtml(
  filename: string,
  options: LoadOptions = {},
): Promise<ImportedHtml> {
  const raw = await readFile(path.join(CONTENT_DIR, filename), "utf8");
  const { styles, rest } = extractStyles(raw);
  const body = extractBody(rest);
  const deduped = dedupeChrome(body);
  const spliced = options.splices ? applySplices(deduped, options.splices) : deduped;
  const tagged = tagInteractionHooks(spliced);
  return { styles, body: tagged };
}
