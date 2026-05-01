import { loadImportedHtml, type Splice } from "lib/imported-html";
import { ImportedPageRuntime } from "components/imported-page-runtime";

type ImportedPageProps = {
  /** Filename inside content/imported-html, e.g. "mujo_homepage.html". */
  filename: string;
  /** Sentinel-bracketed regions to replace with mount-point markers. */
  splices?: Splice[];
};

/**
 * Server component that streams a mechanically ported HTML page.
 * - Reads the source HTML once at build/request time.
 * - Renders deduped page-specific <style> and body markup.
 * - Wraps in <ImportedPageRuntime /> so client-side wiring (checkout,
 *   cart, reveal) attaches via event delegation without rewriting the
 *   markup.
 */
export async function ImportedPage({ filename, splices }: ImportedPageProps) {
  const { styles, body } = await loadImportedHtml(filename, { splices });

  return (
    <ImportedPageRuntime>
      {styles && <style dangerouslySetInnerHTML={{ __html: styles }} />}
      <div
        className="mujo-imported"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </ImportedPageRuntime>
  );
}
