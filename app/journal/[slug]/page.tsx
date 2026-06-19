import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ImportedPage } from "components/imported-page";
import { articleSchema, jsonLdScript } from "lib/schema";

type PageProps = {
  params: Promise<{ slug: string }>;
};

/**
 * /journal/[slug]
 * Only slugs present in PUBLISHED render — each serves its ported HTML file +
 * real SEO metadata. Any other slug returns a 404 (notFound) so search engines
 * never index empty placeholder pages for posts that don't exist.
 * To publish a new post: add it to PUBLISHED (key = slug) and drop its HTML in
 * content/imported-html/.
 */
type Post = {
  file: string;
  title: string;
  description: string;
  headline: string;
};

const PUBLISHED: Record<string, Post> = {
  "introducing-mujo-the-coffee-alternative-thats-changing-the-game": {
    file: "mujo_journal_introducing-mujo-the-coffee-alternative-thats-changing-the-game.html",
    title: "Introducing Mujo: The Coffee Alternative for the Modern Human",
    description:
      "Meet Mujo, a blend of functional mushrooms and adaptogenic plants built as a calmer alternative to coffee. The story behind the name and the ritual.",
    headline:
      "Introducing Mujo, a functional-mushroom coffee alternative built for resilience and presence.",
  },
  "the-story-of-coffee-from-divine-elixir-to-a-daily-brew-that-could-be-making-you-tired":
    {
      file: "mujo_journal_the-story-of-coffee-from-divine-elixir-to-a-daily-brew-that-could-be-making-you-tired.html",
      title:
        "The Story of Coffee: From Divine Elixir to a Brew That Could Be Making You Tired",
      description:
        "How caffeine works on your brain, why the crash is built in, and how the habit loop behind your morning coffee could be keeping you tired.",
      headline:
        "The science of caffeine, the habit loop behind your morning coffee, and why it could be making you tired.",
    },
  "founding-mujo-the-easiest-way-for-stress-to-not-work-against-you": {
    file: "mujo_journal_founding-mujo-the-easiest-way-for-stress-to-not-work-against-you.html",
    title:
      "Why I Created Mujo: The Easiest Way to Stop Stress Working Against You",
    description:
      "Mujo's founder on burnout, losing her dad too young, and building a science-backed daily ritual for stress resilience and sustainable energy.",
    headline:
      "The founder story behind Mujo, built at a kitchen table on a mission to make stress stop working against you.",
  },
  "what-you-need-to-know-about-functional-mushroom-active-compounds-and-beta-glucans":
    {
      file: "mujo_journal_what-you-need-to-know-about-functional-mushroom-active-compounds-and-beta-glucans.html",
      title:
        "Functional Mushroom Active Compounds and Beta-Glucans: What to Know",
      description:
        "What beta-glucans are, why fruiting body beats mycelium, how to read mushroom supplement labels, and what extraction ratios like 8:1 actually mean.",
      headline:
        "A practical guide to beta-glucans, fruiting body vs. mycelium, and how to read a mushroom supplement label.",
    },
  "what-you-actually-got-from-your-mama-besides-life-and-good-looks": {
    file: "mujo_journal_what-you-actually-got-from-your-mama-besides-life-and-good-looks.html",
    title: "What You Inherited from Your Mom: Your Gut, Your Mood, Your Focus",
    description:
      "The microbiome you got from your mom shapes your mood, focus, and stress response. Here is how to nourish your gut-brain connection today.",
    headline:
      "The microbiome you inherit from your mother shapes your mood, focus, and resilience, and you can reshape it every day.",
  },
  "powdered-mushrooms-vs-extracts-and-the-ritual-of-potency": {
    file: "mujo_journal_powdered-mushrooms-vs-extracts-and-the-ritual-of-potency.html",
    title: "Powdered Mushrooms vs Extracts: The Ritual of Potency",
    description:
      "Whole mushroom powder vs dual-extracted mushrooms. Why chitin, dosage, and bioavailability decide whether your mushroom coffee is flavor or function.",
    headline:
      "Whole mushroom powders lock their most potent compounds behind chitin, while dual extraction delivers a dose your body can actually use.",
  },
  "the-problem-with-resolutions-and-what-to-do-instead": {
    file: "mujo_journal_the-problem-with-resolutions-and-what-to-do-instead.html",
    title: "The Problem with Resolutions (and What to Do Instead)",
    description:
      "Why your New Year's list keeps breaking by January 15th, and what actually drives lasting change: clarity, alignment, and small daily action.",
    headline:
      "Resolutions don't work the way we do them. Clarity, not hype, is what creates lasting change.",
  },
  "what-your-body-actually-needs": {
    file: "mujo_journal_what-your-body-actually-needs.html",
    title: "You Don't Need a Cold Plunge. Here's What Your Body Actually Needs.",
    description:
      "The wellness industry sells complexity. Your body needs five fundamentals: nervous system, metabolism, hormones, attention, and mitochondria. Here's the 80/20.",
    headline:
      "Real health is built on a handful of fundamentals, not a $25 billion biohacking shelf.",
  },
  "what-bringing-mujo-to-market-taught-me": {
    file: "mujo_journal_what-bringing-mujo-to-market-taught-me.html",
    title: "What Bringing Mujo to Market Actually Taught Me",
    description:
      "Founder Kinga on the How To Start Up podcast with Juliet Fallowfield: customer discovery with strangers, lowering first-purchase risk, and the unglamorous work behind building a quiet wellness brand.",
    headline: "What bringing Mujo to market actually taught me.",
  },
};

// Only the slugs in PUBLISHED are valid routes. dynamicParams=false makes
// every other slug return a true HTTP 404 at the routing layer (not a soft 404)
// — required because PPR is on globally, which would otherwise stream a 200
// shell before notFound() runs. Published posts get statically pre-rendered.
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(PUBLISHED).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = PUBLISHED[slug];
  if (!post) notFound();
  return {
    title: `${post.title} · Mujo Journal`,
    description: post.description,
    alternates: { canonical: `/journal/${slug}` },
  };
}

export default async function JournalPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = PUBLISHED[slug];
  if (!post) notFound();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            articleSchema({
              url: `/journal/${slug}`,
              headline: post.headline,
              description: post.description,
            }),
          ),
        }}
      />
      <ImportedPage filename={post.file} />
    </>
  );
}
