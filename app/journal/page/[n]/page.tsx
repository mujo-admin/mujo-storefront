import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ImportedPage } from "components/imported-page";

/**
 * /journal/page/[n] — paginated journal index (9 posts/page).
 * Page 1 lives at /journal; /journal/page/1 redirects there. Each additional
 * page renders its own static index file. Unknown pages 404.
 */
type PageProps = {
  params: Promise<{ n: string }>;
};

const PAGES: Record<string, { file: string; title: string }> = {
  "2": { file: "mujo_journal_page-2.html", title: "Journal (Page 2) · Mujo" },
};

export function generateStaticParams() {
  return Object.keys(PAGES).map((n) => ({ n }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { n } = await params;
  const page = PAGES[n];
  return {
    title: page?.title ?? "Journal · Mujo",
    description:
      "Field notes on rituals, recovery, motherhood, and modern performance.",
    alternates: { canonical: `/journal/page/${n}` },
  };
}

export default async function JournalPagedIndex({ params }: PageProps) {
  const { n } = await params;
  if (n === "1") redirect("/journal");
  const page = PAGES[n];
  if (!page) notFound();
  return <ImportedPage filename={page.file} />;
}
