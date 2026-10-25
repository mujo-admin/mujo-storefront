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

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const CONTENT_DIR = path.join(process.cwd(), "content", "imported-html");

export type ImportedHtml = {
  /** Page-specific CSS, ready to drop into a `<style>` tag. */
  styles: string;
  /** Inner body markup. Already deduped against layout-level chrome. */
  body: string;
  /** The first-screen picture, for a high-priority preload (may be empty). */
  heroImages: string[];
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

/**
 * Strip real <script> blocks while leaving HTML comments intact.
 *
 * Comments are matched as atomic units in the same alternation, so a "<script"
 * written *inside* a comment can never start a script match. Without that, an
 * explanatory comment that merely mentions `<script>` swallows everything up to
 * the next real `</script>` — which is exactly what silently deleted the Loox
 * review feed and the whole FAQ section from the Ritual PDP (~10k chars) between
 * the W3 cutover and 2026-08-24.
 *
 * Comments must survive this pass regardless: applySplices() locates the regions
 * it replaces by sentinel comment (MUJO_RITUAL_BUYBOX_START, …).
 */
function stripScripts(html: string): string {
  return html.replace(
    /<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>/g,
    (match) => (match.startsWith("<!--") ? match : ""),
  );
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
    // Note: the static `.quiz-pill` button + `.qs-overlay` modal in the
    // source HTMLs stay opacity:0/pointer-events:none by default (they only
    // animated in via the stripped <script>). They're invisible dead
    // markup. The React <QuizPill /> + <QuizSheet /> render on top.
  ].reduce<string>(
    (acc, [re, sub]) => acc.replace(re as RegExp, sub as string),
    html,
  );
}

/** Drop the global :root {} block from inline <style>; tokens are global now. */
function stripRootBlock(css: string): string {
  return css.replace(/:root\s*\{[\s\S]*?\}/, "");
}

/**
 * Scope a page's CSS under the `.mujo-imported` wrapper so its generic selectors
 * (the `*` reset, `body`/`img`, `.price`, `.nav`, `.announcement`, …) can't leak
 * out and clobber shared React components (cart drawer, nav, footer). Used for
 * merch pages, whose product `.price { font-size: 32px }` was bleeding into the
 * cart-drawer totals. Scopes @media/@supports inner rules, leaves
 * @keyframes/@font-face untouched, and maps html/body to the wrapper itself.
 */
const IMPORTED_SCOPE = ".mujo-imported";

function scopeSelectorList(selectorList: string): string {
  return selectorList
    .split(",")
    .map((raw) => {
      const sel = raw.trim();
      if (!sel) return "";
      if (sel === "html" || sel === "body") return IMPORTED_SCOPE;
      if (/^(html|body)\b/.test(sel)) {
        return sel.replace(/^(html|body)\b/, IMPORTED_SCOPE);
      }
      return `${IMPORTED_SCOPE} ${sel}`;
    })
    .filter(Boolean)
    .join(", ");
}

function scopeCss(css: string): string {
  // Strip comments first so stray braces/commas inside them can't confuse the
  // brace walker below.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  let i = 0;
  while (i < clean.length) {
    const open = clean.indexOf("{", i);
    if (open === -1) break;
    const prelude = clean.slice(i, open).trim();
    // Find the matching close brace for this block.
    let depth = 1;
    let j = open + 1;
    while (j < clean.length && depth > 0) {
      const c = clean[j];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      j++;
    }
    const inner = clean.slice(open + 1, j - 1);
    if (/^@(media|supports|container)/i.test(prelude)) {
      out += `${prelude} {${scopeCss(inner)}}`;
    } else if (/^@/.test(prelude)) {
      // @keyframes / @font-face / @import / @page — leave untouched.
      out += `${prelude} {${inner}}`;
    } else if (prelude) {
      out += `${scopeSelectorList(prelude)} {${inner}}`;
    }
    i = j;
  }
  return out;
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
    .replace(/Mujo_logo_orange\.png/g, "/images/logo/mujo-logo-clay.png")
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

/* ───────────────────────── Mobile speed passes ─────────────────────────
 * (2026-10-25, plans/2026-10-25-mobile-speed-fixes.md, docs/performance.md)
 *
 * The designed pages fade every block in with `.reveal` (opacity 0 until the
 * runtime marks it `.on`) and give every picture an inline CSS background, so
 * on a phone the hero stayed blank until the site's code had loaded and every
 * picture on the page downloaded at once. These passes run last, on the final
 * markup, so nothing above sees different input than before:
 *
 *   - first screen (the opening <section>s up to and including the first one
 *     that holds a picture): `reveal` removed so it shows at first paint; its
 *     first picture is reported back for a high-priority preload;
 *   - the rest: inline background pictures move to `data-bg` (set by
 *     useLazyMedia() when they come near the screen), <img> without a loading
 *     attribute become lazy, and autoplay videos wait until they are on screen.
 *
 * A page whose first <section> starts far down (journal posts) has no first
 * screen; only its lower pictures and videos are deferred, its first picture
 * stays as written.
 */

/** A first <section> that starts later than this is not the hero. */
const FIRST_SCREEN_MAX_START = 6000;
/** Never treat more than this many opening sections as the first screen. */
const FIRST_SCREEN_MAX_SECTIONS = 2;

const PICTURE_RE = /<img\b|url\(/i;

/** Index just past the `</section>` that closes the `<section` at `start`. */
function sectionEnd(html: string, start: number): number {
  const re = /<section\b|<\/section>/gi;
  re.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[0][1] === "/") {
      depth--;
      if (depth === 0) return m.index + m[0].length;
    } else {
      depth++;
    }
  }
  return -1;
}

/** Split body markup into [firstScreen, rest]; null when there is no hero section. */
export function splitFirstScreen(html: string): [string, string] | null {
  const first = html.search(/<section\b/i);
  if (first === -1 || first > FIRST_SCREEN_MAX_START) return null;
  let start = first;
  let end = first;
  for (let n = 0; n < FIRST_SCREEN_MAX_SECTIONS; n++) {
    if (n > 0) {
      // Extend into the next section only when it follows right away (just
      // tags or comments between, no text), e.g. the shop heading then its grid.
      const offset = html.slice(end).search(/<section\b/i);
      if (offset === -1) break;
      const between = html.slice(end, end + offset).replace(/<!--[\s\S]*?-->/g, "");
      if (between.length > 500 || between.replace(/<[^>]+>/g, "").trim() !== "") break;
      start = end + offset;
    }
    const close = sectionEnd(html, start);
    if (close === -1) break;
    end = close;
    if (PICTURE_RE.test(html.slice(start, close))) break;
  }
  return [html.slice(0, end), html.slice(end)];
}

/** Remove the `reveal` token from every class attribute. */
function unreveal(html: string): string {
  return html.replace(/\bclass="([^"]*)"/g, (whole, cls: string) => {
    if (!/(^|\s)reveal(\s|$)/.test(cls)) return whole;
    const next = cls.split(/\s+/).filter((c) => c && c !== "reveal").join(" ");
    return `class="${next}"`;
  });
}

const BG_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/i;

/**
 * The first-screen picture to preload, when it is a CSS background. A first
 * <img> needs no preload (the browser sees it in the HTML and it gets
 * fetchpriority="high"; preloading its src could even fetch the wrong srcset
 * size), so then nothing is returned.
 */
function firstScreenPictures(html: string): string[] {
  const re = /<img\b[^>]*>|<[a-z][a-z0-9-]*\b[^<>]*\sstyle="[^"]*url\([^"]*"[^<>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    if (/display:\s*none/i.test(tag)) continue; // desktop-only twin, never shown on a phone
    if (/^<img\b/i.test(tag)) return [];
    const url = tag.match(BG_URL_RE)?.[2];
    if (url && !url.startsWith("data:")) return [url];
  }
  return [];
}

/** Give the first-screen <img> priority and make sure none is lazy. */
function prioritiseImgs(html: string): string {
  let first = true;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    let next = tag.replace(/\sloading="lazy"/i, "");
    if (first && !/fetchpriority=/i.test(next)) {
      next = next.replace(/^<img\b/i, '<img fetchpriority="high"');
    }
    first = false;
    return next;
  });
}

/**
 * Move inline background pictures to data-bg, make plain <img> lazy, and stop
 * autoplay videos from loading before they are on screen.
 */
function deferRest(html: string, keepFirstPicture: boolean): string {
  let keptBg = !keepFirstPicture;
  let keptImg = !keepFirstPicture;
  return html.replace(/<([a-z][a-z0-9-]*)\b([^<>]*)>/gi, (tag, name: string, attrs: string) => {
    const lower = name.toLowerCase();
    if (lower === "img") {
      if (!keptImg) {
        keptImg = true;
        return tag;
      }
      if (/\sloading=/i.test(attrs)) return tag;
      return tag.replace(/^<img\b/i, '<img loading="lazy" decoding="async"');
    }
    if (lower === "video") {
      if (!/\sautoplay\b/i.test(attrs)) return tag;
      let next = tag.replace(/\sautoplay\b/i, "").replace(/\spreload="[^"]*"/i, "");
      // The cover image would still download up front; set it when near.
      next = next.replace(/\sposter="([^"]*)"/i, ' data-poster="$1"');
      next = next.replace(/^<video\b/i, '<video preload="none" data-autoplay');
      return next;
    }
    const style = attrs.match(/\sstyle="([^"]*)"/i);
    if (!style || !BG_URL_RE.test(style[1]!)) return tag;
    if (/data-bg=/i.test(attrs)) return tag;
    const url = style[1]!.match(BG_URL_RE)![2]!;
    if (url.startsWith("data:")) return tag;
    if (!keptBg) {
      keptBg = true;
      return tag;
    }
    // background-image: url(X);  → dropped
    // background: url(X) center/cover no-repeat;  → background: center/cover no-repeat;
    const css = style[1]!
      .replace(/background-image\s*:\s*url\([^)]*\)\s*;?/i, "")
      .replace(/(background\s*:\s*)url\([^)]*\)\s*/i, "$1")
      .trim();
    const safeUrl = url.replace(/"/g, "&quot;");
    const rebuilt = attrs.replace(style[0], css ? ` style="${css}"` : "");
    return `<${name} data-bg="${safeUrl}"${rebuilt}>`;
  });
}

/**
 * Product gallery thumbnails are ~70–120px tiles but were pointed at the 800px
 * pictures (40–90 KB each, all loading with the main photo). Use the 400px
 * version when it exists on disk; the full-size photo on tap is unchanged.
 */
const PUBLIC_DIR = path.join(process.cwd(), "public");
function smallThumbs(html: string): string {
  return html.replace(/<[a-z]+\b[^<>]*class="[^"]*\bgallery-thumb\b[^"]*"[^<>]*>/gi, (tag) =>
    tag.replace(/url\(\s*(['"]?)(\/images\/[^'")]+)-800\.webp\1\s*\)/gi, (whole, q: string, stem: string) =>
      existsSync(path.join(PUBLIC_DIR, `${stem}-400.webp`)) ? `url(${q}${stem}-400.webp${q})` : whole,
    ),
  );
}

/** Apply the first-screen and lazy passes. Returns markup + hero pictures. */
export function applySpeedPasses(input: string): { body: string; heroImages: string[] } {
  const html = smallThumbs(input);
  const split = splitFirstScreen(html);
  if (!split) return { body: deferRest(html, true), heroImages: [] };
  const [first, rest] = split;
  const heroImages = firstScreenPictures(first);
  return {
    body: prioritiseImgs(unreveal(first)) + deferRest(rest, false),
    heroImages,
  };
}

export async function loadImportedHtml(
  filename: string,
  options: LoadOptions = {},
): Promise<ImportedHtml> {
  const raw = await readFile(path.join(CONTENT_DIR, filename), "utf8");
  const { styles, rest } = extractStyles(raw);
  // Merch pages define generic global selectors (.price 32px, .nav, .announcement,
  // the * reset, …) that leak into shared React UI. Scope their CSS under the
  // .mujo-imported wrapper. Other imported pages are left as-is (lower blast
  // radius); the cart drawer is independently hardened against stray .price.
  const scopedStyles = filename.startsWith("merch_") ? scopeCss(styles) : styles;
  const body = extractBody(rest);
  // Script stripping stays *after* chrome dedupe, exactly where it ran before,
  // so the chrome regexes see byte-identical input to what they always have.
  const deduped = stripScripts(dedupeChrome(body));
  const spliced = options.splices ? applySplices(deduped, options.splices) : deduped;
  const tagged = tagInteractionHooks(spliced);
  const { body: fast, heroImages } = applySpeedPasses(tagged);
  return { styles: scopedStyles, body: fast, heroImages };
}
