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
    [/<script[\s\S]*?<\/script>/g, ""],
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
    .replace(/onclick="addToCart\(([^)]*)\)"/g, 'data-mujo-action="add-to-cart" data-mujo-args="$1"')
    .replace(/onsubmit="handle[A-Za-z]+\(\)"/g, 'data-mujo-form="generic"')
    .replace(/onsubmit="handle[A-Za-z]+\(event\)"/g, 'data-mujo-form="generic"')
    .replace(/Mujo_logo_orange\.png/g, "/images/logo/mujo-logo-orange.png");
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

export async function loadImportedHtml(filename: string): Promise<ImportedHtml> {
  const raw = await readFile(path.join(CONTENT_DIR, filename), "utf8");
  const { styles, rest } = extractStyles(raw);
  const body = extractBody(rest);
  const deduped = dedupeChrome(body);
  const tagged = tagInteractionHooks(deduped);
  return { styles, body: tagged };
}
