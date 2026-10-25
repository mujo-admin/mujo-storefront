import type { ComponentType, ReactNode } from "react";
import parse, { Element, type DOMNode } from "html-react-parser";
import { loadImportedHtml, type Splice } from "lib/imported-html";
import { ImportedPageRuntime } from "components/imported-page-runtime";

type ImportedPageProps = {
  /** Filename inside content/imported-html, e.g. "mujo_homepage.html". */
  filename: string;
  /** Sentinel-bracketed regions to replace with mount-point markers. */
  splices?: Splice[];
  /**
   * Components rendered *in place* of `<div data-mujo-mount="<id>">` markers,
   * keyed by mount id. When set, the page body is turned into React elements
   * on the server (html-react-parser) instead of an HTML string, so these
   * components arrive in the first HTML rather than after the page's code runs.
   * Used for the buy boxes on /ritual and the two product pages.
   */
  slots?: Record<string, ReactNode>;
  /** Client provider wrapping the page, for state shared between slots. */
  provider?: ComponentType<{ children: ReactNode }>;
};

/**
 * Server component that streams a mechanically ported HTML page.
 * - Reads the source HTML once at build/request time.
 * - Renders deduped page-specific <style> and body markup.
 * - Preloads the first-screen picture at high priority (the hero is usually a
 *   CSS background, which the browser would otherwise find late).
 * - Wraps in <ImportedPageRuntime /> so client-side wiring (checkout,
 *   cart, reveal, lazy pictures) attaches via event delegation without
 *   rewriting the markup.
 */
export async function ImportedPage({
  filename,
  splices,
  slots,
  provider: Provider,
}: ImportedPageProps) {
  const { styles, body, heroImages } = await loadImportedHtml(filename, { splices });
  // Hero picture preload. Written as raw markup rather than ReactDOM.preload():
  // every page is rendered per request (the layout reads the session cookie),
  // and on that resume path React treats a preload() hint as already sent and
  // drops it. A raw <link rel="preload"> in the body still reaches the
  // browser's preload scanner as soon as this point of the HTML arrives.
  const heroPreload = heroImages
    .map(
      (href) =>
        `<link rel="preload" as="image" href="${href.replace(/"/g, "&quot;")}" fetchpriority="high">`,
    )
    .join("");

  const content = slots ? (
    <div className="mujo-imported">
      {parse(body, {
        replace(node: DOMNode) {
          if (!(node instanceof Element)) return undefined;
          const id = node.attribs["data-mujo-mount"];
          if (!id || !(id in slots)) return undefined;
          return <div data-mujo-mount={id}>{slots[id]}</div>;
        },
      })}
    </div>
  ) : (
    <div className="mujo-imported" dangerouslySetInnerHTML={{ __html: body }} />
  );

  return (
    <ImportedPageRuntime>
      {heroPreload && (
        <span hidden dangerouslySetInnerHTML={{ __html: heroPreload }} />
      )}
      {styles && <style dangerouslySetInnerHTML={{ __html: styles }} />}
      {Provider ? <Provider>{content}</Provider> : content}
    </ImportedPageRuntime>
  );
}
