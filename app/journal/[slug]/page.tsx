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
  "unlocking-vitality-the-journey-from-stress-to-energy": {
    file: "mujo_journal_unlocking-vitality-the-journey-from-stress-to-energy.html",
    title:
      "From Stress to Energy: The Brain States and Mitochondria Behind Vitality",
    description:
      "Your brainwaves and your mitochondria decide how energized you feel. How chronic stress drains both, and how adaptogens and mushrooms help support them.",
    headline:
      "How brain states and mitochondria shape your energy, and why chronic stress drains both.",
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
  "caffeine-and-mental-health-what-s-the-buzz-really": {
    file: "mujo_journal_caffeine-and-mental-health-what-s-the-buzz-really.html",
    title: "Caffeine and Mental Health: What's the Buzz, Really?",
    description:
      "Caffeine is a psychoactive drug that touches anxiety, sleep, hydration, and gut health. Here is how your morning cup affects your mental well-being.",
    headline:
      "Caffeine quietly shapes anxiety, sleep, hydration, and gut health, and for many people it works against their mental health.",
  },
  "powdered-mushrooms-vs-extracts-and-the-ritual-of-potency": {
    file: "mujo_journal_powdered-mushrooms-vs-extracts-and-the-ritual-of-potency.html",
    title: "Powdered Mushrooms vs Extracts: The Ritual of Potency",
    description:
      "Whole mushroom powder vs dual-extracted mushrooms. Why chitin, dosage, and bioavailability decide whether your mushroom coffee is flavor or function.",
    headline:
      "Whole mushroom powders lock their most potent compounds behind chitin, while dual extraction delivers a dose your body can actually use.",
  },
  "what-we-inherit-from-our-fathers-nervous-systems-stress-and-the-rituals-that-can-heal-them":
    {
      file: "mujo_journal_what-we-inherit-from-our-fathers-nervous-systems-stress-and-the-rituals-that-can-heal-them.html",
      title:
        "What We Inherit from Our Fathers: Nervous Systems, Stress, and Rituals",
      description:
        "We inherit more than our father's eyes. We inherit a nervous system blueprint for stress. Here is how those patterns form, and how they can be rewritten.",
      headline:
        "We inherit a nervous system blueprint from our fathers, and those stress patterns can be re-learned with the right rituals.",
    },
  "the-biology-of-burnout-and-why-caffeine-makes-it-worse": {
    file: "mujo_journal_the-biology-of-burnout-and-why-caffeine-makes-it-worse.html",
    title: "The Biology of Burnout (and Why Caffeine Makes It Worse)",
    description:
      "Burnout is a nervous system pushed past recovery, and caffeine intensifies it. The adenosine crash, the cortisol loop, and what to do instead.",
    headline:
      "Burnout is a nervous system pushed past its capacity to recover, and caffeine intensifies the loop instead of fixing it.",
  },
  "the-problem-with-resolutions-and-what-to-do-instead": {
    file: "mujo_journal_the-problem-with-resolutions-and-what-to-do-instead.html",
    title: "The Problem with Resolutions (and What to Do Instead)",
    description:
      "Why your New Year's list keeps breaking by January 15th, and what actually drives lasting change: clarity, alignment, and small daily action.",
    headline:
      "Resolutions don't work the way we do them. Clarity, not hype, is what creates lasting change.",
  },
  "your-brain-can-grow-new-connections-this-mushroom-helps-it-do-that": {
    file: "mujo_journal_your-brain-can-grow-new-connections-this-mushroom-helps-it-do-that.html",
    title: "What Lion's Mane Actually Does for Your Brain",
    description:
      "What Lion's Mane really does to your brain, how long it takes, and how to spot a quality extract from expensive grain dust. Honest, science-backed.",
    headline:
      "Lion's Mane stimulates Nerve Growth Factor, but only a properly extracted fruiting-body product can deliver it.",
  },
  "your-gut-is-talking-to-your-brain-right-now": {
    file: "mujo_journal_your-gut-is-talking-to-your-brain-right-now.html",
    title: "Your Gut Is Talking to Your Brain Right Now",
    description:
      "The gut-brain axis, explained simply: how the vagus nerve, serotonin, and dopamine in your gut shape your mood, focus, and motivation every day.",
    headline:
      "Your gut and brain are in constant two-way conversation, and what you eat is part of it.",
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
