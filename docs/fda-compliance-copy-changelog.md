# FDA Compliance Copy Cleanup — Changelog

> Branch `fix/fda-compliance-copy` (off `main`). Record of every claim/element removed or reframed, with the rule it satisfies. The attorney-review artifact. Governing docs (in the AIOS workspace): the 2026-06-16 audit + the 2026-06-17 claims-substantiation matrix. **Nothing merges/deploys until attorney sign-off.** Journal posts are a separate later sweep.

---

## 2026-06-17 — Diagnostic quiz removed (highest-risk element)

**Why:** the "60-second audit / Nervous System Reset Plan" quiz framed the product as a treatment for diagnosable conditions (anxiety, insomnia, "cortisol hijacks the second half of the night," "HPA axis recalibration," "wired tired"). Disease-intent claims → unapproved-drug exposure. This was the single most exposed element on the site. Replaced by a Klaviyo welcome popup (discount + PDF) Kinga manages separately.

**React layer (live quiz):**
- `app/layout.tsx` — removed `QuizProvider` + `QuizPill` + `QuizSheet` mounts + import. (Killed the site-wide floating pill + sheet on every page.)
- `components/MujoQuiz.tsx` — **deleted** (held all the quiz questions + result copy; now unreferenced).
- `components/imported-page-runtime.tsx` — removed `useQuizSheet` import + `openQuiz` hook + dep; `open-quiz` CTA action is now an inert `preventDefault()` so any legacy quiz CTA is harmless (no error, no jump).

**Homepage (`content/imported-html/mujo_homepage.html`):**
- Removed the floating quiz pill + the entire 6-step quiz sheet markup (136 lines, all the disease-question copy) from the DOM.
- Mobile-menu "Take the audit" CTA → "Shop the Ritual" (`/products/mujo-ritual`); removed the "Reset Plan tuned to your pattern" line.

**Ritual landing (`content/imported-html/mujo_ritual_cacao_landing_page.html`):**
- Removed the "QUIZ CTA" promo section (33 lines: "find out what's holding back your energy… free 5-step plan").
- Hero CTA "Find my pattern (60 sec)" → "Shop the Ritual" (`/products/mujo-ritual`).
- *Still pending (next pass — full /ritual rewrite):* the invisible floating-pill + quiz-sheet markup still in source (not served visibly), the meta description, and all the non-compliant prose (cortisol-27.9%, blood-brain-barrier, NGF, HPA-axis, the ingredient claims).

**Verification:** `npx tsc --noEmit` clean (exit 0). No `MujoQuiz` / `useQuizSheet` references remain in `app/`, `components/`, `lib/` (only the inert `open-quiz` tagging rules in `lib/imported-html.ts`).

## 2026-06-18 — /ritual landing page fully rewritten + footer disclaimer removed site-wide

Positioning evolved to warm "More Human, Less Optimized" (brand-positioning.md → v2.0 same day). `content/imported-html/mujo_ritual_cacao_landing_page.html`:
- **Meta + hero:** "Clinically dosed… Nervous System Reset Plan" → warm coffee-alternative meta; H1 "Doing more with less. *Finally, a ritual that fills your morning cup.*" (Kinga's copy); taste-first sub; eyebrow "Caffeine-light · Mushroom cacao"; trust badges "Zero caffeine"→"Under 5mg caffeine", "Clinically dosed"→"Doses on the label"; citation de-neurowellness'd; hero stat "9,600mg equivalent" → "<5mg caffeine".
- **Problem section:** removed adenosine/HPA-axis/ATP/DSM-5/"foggy mornings"/83%-stress block → warm "why a coffee alternative, not another coffee" (kept fruiting-body quality point).
- **Solution:** comparison table dropped Anxiety/Cortisol, Sleep/Restored, DSM-5 rows → Morning/3pm/Jitters/Taste; cortisol-27.9% + HPA points → rhodiola everyday-stress + fruiting-body + under-5mg.
- **Reviews:** 3 health-claim quotes → Kinga's compliant Maria/Brandon/Gabi quotes (photos unchanged); dropped the "89% reduced afternoon crash" + "76% notice difference" efficacy stat tiles.
- **Ingredients:** removed ashwagandha/bacopa/chaga cards (stay on legal ingredient list); lion's mane + curcumin name-only; rhodiola/cordyceps/cacao/maca de-claimed; intro dropped "dosed to the studies / 9,600mg / nootropics equivalent"; mycelium-quality note kept.
- **Founder story:** removed "near burnout / constant anxiety / sharper / mentally clearer / looked younger / nervous system regulation / neurowellness" → warm "ritual I looked forward to."
- **FAQ:** Q1 dropped adenosine/detox/clarity-timeline; Q2 dropped Google-Chandrasekhar/285x → "what's in it / no proprietary blend"; Q3 **removed the results-timeline** (7–10 days / weeks 2–3 / weeks 3–6) → "daily ritual" answer; Q4 (taste) kept.
- **Pricing/CTA:** anchor dropped "keeps your cortisol elevated"; right-rail dropped "everything shifts / physiological signals / clinically studied KSM-66 / 285x / zero dependency" → warm + under-5mg; final-CTA guarantee "if your 3pm doesn't feel different" → "if you don't love it."
- **Removed** the leftover invisible quiz pill + sheet markup (222 lines) and the **geo banner** (US-only); exit-popup "essays on the physiology of modern stress" → neutral.
- **Footer (`components/layout/footer.tsx`):** removed the DSHEA "*These statements have not been evaluated by the FDA…" disclaimer — **renders site-wide**, invalid on a conventional food.

**Verification:** `npx tsc --noEmit` clean (exit 0). Note: dead quiz *result-body* JS (HPA/cortisol strings) still sits inside the page's `<script>` block, which the import helper strips at render — unserved dead code, not a live risk; clean up opportunistically.

## 2026-06-19 — Ingredient card view (both pages) + full PDP sweep + /science removed

**Ingredient card view (Kinga-designed): name → Latin → orange benefit pill + sage "✓ verified" compound pills.** Built on /ritual landing (9-card `.igrid`, new `.ipills`/`.ip-benefit` CSS) and the PDP dossier (existing `ing-compact`, converted). Compliance posture (Kinga 2026-06-19): soft one-word benefits OK (category-normal, MudWtr); exiting ingredients (ashwagandha/bacopa/chaga) stay shown but **no dosage, generic names** (no "KSM-66"/"300mg") until reformulation; chaga = no benefit word; verified compounds named (hericenones / cordycepins / rosavins / bacosides) as quality proof; **beta-glucans → "beta-(1,3)(1,6)-glucans"** everywhere; Rhodiola → **Altai/Siberia** (corrected from Himalaya). Dual-extraction "full spectrum from behind the cell walls" added as the section intro. /ritual stat strip centered (2 tiles) after dropping the efficacy tiles.

**PDP (`ritual_cacao_shop_pdp.html`) fully swept** — meta; info-hook; quick facts ("Clinically dosed"/"285x"/"Zero caffeine" → "Doses on the label"/"Bioavailable curcumin"/"Under 5mg"); description accordions (dropped 9,600mg/3,000mg/3,400mg-nootropics/KSM-66-300mg/"clinically meaningful dose"); stat strip → caffeine/extract/ingredients/sugar; benefits section (killed "Lower cortisol"/"master hormone"/NGF/"inflammatory response in the brain"); results timeline → ritual/habit framing; comparison table (dropped 300mg-KSM-66/285x/sub-clinical, caffeine "Zero"→"Under 5mg"); FAQ (removed the 7–10-day/weeks-2–3 results timeline + adenosine + blood-brain/NGF/cortisol/ATP "buy separately" answer); 3 testimonials → compliant Maria/Brandon/Gabi; **React `app/products/mujo-ritual/page.tsx` metadata + JSON-LD** de-branded (no KSM-66/RhodioLife/Longvida; caffeine-free → caffeine-light). PDP source residual claim-token grep = clean.

**/science page removed** (conventional-food path, no health-claim science page) — deleted `app/science/page.tsx`, added `/science → /about` redirect in `next.config.ts` (permanent:false), removed from nav, mobile menu, footer, sitemap. Replacement (a "why Mujo" / About-led section) deferred.

**Ginseng** logged to the claims matrix for the reformulation (Panax, 180–200mg; GRAS documented to 340mg). **Science-paper links** from ingredients to be removed in the /ingredients pass (same implied-claim risk as the science page).

**Verification:** `tsc --noEmit` clean; /ritual, /about, /products/mujo-ritual all 200. (next.config redirect needs a dev-server restart to test locally; active in prod.)

## 2026-06-19 (cont.) — /ingredients fully swept + PDP/landing polish + study links archived

- **Study links archived** to `outputs/legal-and-compliance/mujo-ingredient-study-references-2026-06-19.md` (per ingredient: PubMed IDs + study names, for the substantiation file), then **removed from /ingredients** (9 Evidence blocks + the clinical-references block; same implied-claim risk as the science page).
- **/ingredients fully de-claimed** — all 14 ingredient cards: benefit pills → compliant (compound/sourcing), descriptions stripped of NGF / cortisol-27.9% / blood-brain / mild-cognitive-impairment / ATP / immunity / mitochondrial / gut-brain / hormonal-balance; "KSM-66® Ashwagandha 300mg" → "Ashwagandha · Root extract"; Himalaya → Altai; cacao single-origin → Peruvian; beta-glucans → beta-(1,3)(1,6)-glucans; the "Principles" section reframed ("Clinically backed" → "The right form"; dropped 300mg-dose/clinical-literature/"deliver these benefits"). Served residual-claim grep = clean (0).
- **PDP/landing polish (Kinga screenshot review):** removed the PDP timeline-note box; stripped the "form matters" section's competitor-dig subtexts + the "these are the little things"/"we choose" closers (no-diss); **ingredient images enlarged** (landing card images full-width 150px; PDP dossier converted from horizontal 64px rows to the **same big-image vertical 3-column card format** as the landing); **cacao → "Peruvian · Theobromine"** (single-origin removed) across cards + copy.

## 2026-06-19 (cont.) — Homepage fully swept

`content/imported-html/mujo_homepage.html`: meta; hero (eyebrow → "Caffeine-light · Mushroom cacao"; H1 → "Doing more with less. *Finally, a ritual that fills your morning cup.*"; taste-first sub); trust badges ("Clinically dosed"/"285x"/"Zero caffeine" → "Doses on the label"/"Bioavailable curcumin"/"Under 5mg caffeine", both marquee tracks); tile + section eyebrows de-"Neurowellness"'d; science section ("the dose the studies used"/KSM-66-300mg/Himalayas + "built to reach your brain"/blood-brain/285x → "real forms, openly named" / "a bioavailable form", Altai); "Modern Performance" section ("For a nervous system that's been running hot" + discipline/high-gear/edge + "#1 wellness trend / category Mujo was built for" → "For a calmer, more human morning" + do-more-with-less + softened trend mention); 3 reviews → compliant Maria/Brandon/Gabi ("real impact" → "real mornings"); "Inside the Ritual" ingredient strip de-claimed (KSM-66 → Ashwagandha, "300mg disclosed" → "Root extract", "285× bioavailable" → "Bioavailable form", "Himalayan" → "Altai", "1.5%/5% actives" → "Rosavins · salidrosides"); **removed the leftover dead quiz JS** (133 lines incl. the HPA/cortisol/anxiety result bodies). Served residual grep = clean (0 across 16 tokens).

**All four main live Ritual pages now swept + verified clean: homepage, /ritual, /products/mujo-ritual (PDP), /ingredients** (+ /science removed). Pending: (1) **/lemna** + /products/lemna (pre-launch, lower urgency); (2) **cross-site `foot-fda`** source cleanup (~50 imported-HTML footers — non-visible, React footer already clean); (3) email content (Klaviyo flows). Then: attorney review of the whole branch before merge/deploy.

## 2026-06-19 (cont.) — Homepage cleanups + Rebel Club + journal unpublish + beige-section bug

- **Homepage "What we make" tiles:** removed the check-bullet benefit lines (incl. the "clarity and calm by the second week" results claim) + the orange save-labels ("Save 15%", "Limited founding spots", "Free shipping over $100") from all 3 tiles.
- **Trend claim removed everywhere:** the "top wellness trend of 2026 / Global Wellness Summit" blocks deleted from homepage + /ritual; the PDP's "Neurowellness: #1 trend" callout → restored to a **30-day money-back guarantee** box.
- **Rebel Club:** removed the "One club. Three tribes." section (Mujo Mamis / Padel Club / Creatives — not ready to staff 3 sub-communities) + its meta mention, the orphaned perk, and the dead `/mujo-mamis` + `/mujo-padel-club` footer links.
- **Beige-block bug fixed (`app/globals.css`):** the empty Sonner toaster `<section aria-label="Notifications">` was catching the imported pages' un-scoped global `section { padding: var(--section-y) 0 }` (cream from the leaked `body` bg), rendering as a blank block below the footer site-wide. Added a targeted `body > section[aria-label] { padding:0; min-height:0; background:transparent }` override.
- **Journal — 10 posts unpublished** (the 4 Science-page reads + 6 highest-claim-density posts: gut-brain, vitality/mitochondria, lion's-mane-NGF, burnout-biology, caffeine-mental-health, inherited-nervous-systems). Removed from `app/journal/[slug]/page.tsx` PUBLISHED map + `app/sitemap.ts` + the index + page-2 cards + 21 dead "related-card" cross-links across published posts. All serve the not-found UI (no content; true 404 in prod build via `dynamicParams=false`). Originals archived for future repurposing to `outputs/marketing-and-sales/journal-unpublished-2026-06-19/` (+ INDEX.md with compliant future angles). **Governing rule:** science content must not link back to the product. **Remaining published journal posts (Tier B) still need a de-claim pass.**

**Verification:** `tsc --noEmit` clean; homepage / ritual / PDP / rebel-club 200; all 10 unpublished posts serve not-found (no post content).

## 2026-06-19 (cont.) — DEPLOYED LIVE + second-pass residuals (route metadata / About / chrome)

Kinga authorized deploying to production **ahead of attorney review** (net risk-reducing: the changes *remove* illegal claims). Merged `fix/fda-compliance-copy` → `main` (folded in 2 concurrent subscription-cadence commits, zero overlap) and pushed (`51cb58c3`). **Live on mujoworld.com.**

**Live verification then caught three layers the page-by-page HTML sweep missed** (imported-HTML source ≠ served output):
1. **Route-file metadata + JSON-LD** — `app/ritual/page.tsx` + `app/ingredients/page.tsx` carried `caffeine-free`, `KSM-66`, **`RhodioLife`, `Longvida`** (unlicensed), "clinical doses", "every dose disclosed" into the live `<head>` + structured data. Rewritten to caffeine-light + generic ingredient names + open-labeling.
2. **About page** (`mujo_about.html`, live + linked, not in original scope) — "foundational nervous system support", "Dosed according to research / research-validated", "Clinical doses / if a study used 300mg / sub-therapeutic", KSM-66, founder "coffee was wrecking my nervous system" → reframed to form/quality + open labeling + "doing me more harm than good".
3. **Quiz "Reset Plan" CTA** — still in the shared mobile-menu (`components/layout/mobile-menu.tsx` + 51 imported files' `mm-foot`), served on every page → "Join the Rebel Club"; stale `/science` chrome links removed; homepage `neurowellness` comments + ingredients `KSM-66` comment cleaned.

Second commit `351dd29c` pushed. **Live cross-page sweep clean (0):** home/ritual/ingredients/about/legal — Reset Plan, KSM-66, RhodioLife, Longvida, neurowellness, 285x, cortisol all 0. `tsc` clean.

**Still deferred (known, non-blocking):** Tier B journal posts (kept) + /lemna (pre-launch) carry softer tokens (nervous system, etc.) — scheduled de-claim pass; **email (Klaviyo flows)**; then attorney review of the live state.
