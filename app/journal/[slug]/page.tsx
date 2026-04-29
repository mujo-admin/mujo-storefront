import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { articleSchema, jsonLdScript } from "lib/schema";

type PageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * /journal/[slug] — placeholder template route.
 * Until Kinga migrates 3-5 Shopify blog posts to `content/journal/*.md`
 * (per `_content-sources/journal-migration-brief.md`), every slug renders the
 * post template chrome. The plan locks this as a placeholder ship target;
 * actual post data lands post-cutover via a markdown frontmatter loader.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const title = slug
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
  return {
    title: `${title} · Mujo Journal`,
    description: "Field notes on rituals, recovery, and modern performance.",
    alternates: { canonical: `/journal/${slug}` },
  };
}

export default async function JournalPostPage({ params }: PageProps) {
  const { slug } = await params;
  const headline = slug
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            articleSchema({
              url: `/journal/${slug}`,
              headline,
              description:
                "Field notes on rituals, recovery, and modern performance.",
            }),
          ),
        }}
      />
      <ImportedPage filename="mujo_journal_post.html" />
    </>
  );
}
