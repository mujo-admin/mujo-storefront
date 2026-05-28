import type { Metadata } from "next";
import { ImportedPage } from "components/imported-page";
import { articleSchema, jsonLdScript } from "lib/schema";

type PageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * /journal/[slug]
 * Published posts in PUBLISHED render their own ported HTML file + real SEO
 * metadata. Any other slug falls back to the post-template chrome (the sample
 * cards on the journal index still resolve until they're authored).
 */
type Post = {
  file: string;
  title: string;
  description: string;
  headline: string;
};

const PUBLISHED: Record<string, Post> = {
  "why-you-crash-at-3pm": {
    file: "mujo_journal_why-you-crash-at-3pm.html",
    title: "Why You Crash at 3pm (And What's Actually Happening)",
    description:
      "The 3pm crash isn't lunch or willpower. It's two body clocks crossing in your afternoon. Here's what's actually happening, and how to work with the dip.",
    headline: "Why you crash at 3pm. And what is actually happening.",
  },
  "morning-cortisol-spike-and-coffee": {
    file: "mujo_journal_morning-cortisol-spike-and-coffee.html",
    title: "The Morning Cortisol Spike (And Why Coffee Hurts)",
    description:
      "Your body runs a cortisol surge in the first hour after waking. Pour a strong coffee on top and it can feel wired, not energised. Here's the honest version.",
    headline: "The morning cortisol spike. And why coffee makes it worse.",
  },
  "tired-but-wired": {
    file: "mujo_journal_tired-but-wired.html",
    title: "Tired but Wired: Why You Can't Sleep When Exhausted",
    description:
      "Exhausted all day, then wide awake at bedtime? It isn't a contradiction. It's hyperarousal, a nervous system stuck in go mode. Here's how to help it stand down.",
    headline: "Tired but wired. Why you can't sleep when you're exhausted.",
  },
  "vagal-tone-and-composure": {
    file: "mujo_journal_vagal-tone-and-composure.html",
    title: "Vagal Tone: The Nerve That Decides Your Composure",
    description:
      "Why do two people meet the same bad news so differently? A lot comes down to vagal tone, your nervous system's brake. Here's what it is, and how to train it.",
    headline: "Vagal tone. What it is, and why it decides your composure.",
  },
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = PUBLISHED[slug];
  if (post) {
    return {
      title: `${post.title} · Mujo Journal`,
      description: post.description,
      alternates: { canonical: `/journal/${slug}` },
    };
  }
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
  const post = PUBLISHED[slug];
  const headline =
    post?.headline ??
    slug
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
  const description =
    post?.description ??
    "Field notes on rituals, recovery, and modern performance.";
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            articleSchema({
              url: `/journal/${slug}`,
              headline,
              description,
            }),
          ),
        }}
      />
      <ImportedPage filename={post?.file ?? "mujo_journal_post.html"} />
    </>
  );
}
