/**
 * The journal addresses that exist. Read by next.config.ts, which answers a
 * real HTTP 404 for every other /journal/<slug> and /journal/page/<n> before
 * the page code runs.
 *
 * Why this list exists (Next 16 upgrade, 2026-11-24): every page is rendered
 * per request (the root layout reads the session cookie) and streamed behind
 * app/loading.tsx, so a notFound() inside the page arrives after the 200
 * status has gone out: a "soft 404". Before Next 16, experimental PPR
 * prerendered the journal routes and `dynamicParams = false` gave the real
 * 404; without PPR that setting is no longer enforced for these routes.
 *
 * To publish a post: add its slug here AND to PUBLISHED in
 * app/journal/[slug]/page.tsx (and to app/sitemap.ts). The build fails with a
 * clear message if the two lists differ.
 *
 * Keep this file free of imports: next.config.ts loads it.
 */
export const JOURNAL_POST_SLUGS: readonly string[] = [
  "what-is-lemna-protein",
  "what-is-a-complete-protein",
  "introducing-mujo-the-coffee-alternative-thats-changing-the-game",
  "the-story-of-coffee-from-divine-elixir-to-a-daily-brew-that-could-be-making-you-tired",
  "founding-mujo-the-easiest-way-for-stress-to-not-work-against-you",
  "what-you-need-to-know-about-functional-mushroom-active-compounds-and-beta-glucans",
  "the-problem-with-resolutions-and-what-to-do-instead",
  "what-bringing-mujo-to-market-taught-me",
];

/** Extra journal index pages: /journal/page/<n>. Page 1 is /journal. */
export const JOURNAL_INDEX_PAGES: readonly string[] = ["2"];

/** Fails the build when a page's own list and the list above differ. */
export function assertSameJournalRoutes(
  what: string,
  inPage: readonly string[],
  inList: readonly string[],
): void {
  const missing = inPage.filter((s) => !inList.includes(s));
  const extra = inList.filter((s) => !inPage.includes(s));
  if (missing.length || extra.length) {
    throw new Error(
      `${what} and lib/journal-routes.ts differ. ` +
        (missing.length
          ? `Missing from lib/journal-routes.ts (would answer 404): ${missing.join(", ")}. `
          : "") +
        (extra.length
          ? `Listed in lib/journal-routes.ts but not in the page (would be a soft 404): ${extra.join(", ")}.`
          : ""),
    );
  }
}
