"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useReveal } from "lib/hooks/use-reveal";
import { looxSlugFromPathname, renderLooxForSlug } from "lib/loox";
import { useQuizSheet } from "components/MujoQuiz";
import { useCart } from "components/cart/cart-context";
import { resolvePriceId } from "lib/cart/price-id-map";
import {
  resolveMerchSelection,
  availableSizesFor,
  type MerchColor,
  type MerchSize,
} from "lib/cart/merch-config";

type ImportedPageRuntimeProps = {
  children: ReactNode;
};

const MERCH_SLUGS = ["mujo-frother", "mujo-tee", "mujo-hat", "mujo-crew"] as const;
type MerchSlug = (typeof MERCH_SLUGS)[number];

function isMerchSlug(value: string | undefined): value is MerchSlug {
  return !!value && (MERCH_SLUGS as readonly string[]).includes(value);
}

const MERCH_COLORS: MerchColor[] = ["white", "stone", "desert", "bone", "sandstone"];
const MERCH_SIZES: MerchSize[] = ["xs", "s", "m", "l", "xl"];

/** Convert a swatch title attr ("Desert Dust", "Bone", ...) → MerchColor key. */
function colorFromTitle(title: string | null | undefined): MerchColor | undefined {
  if (!title) return undefined;
  const key = title.trim().split(/\s+/)[0]?.toLowerCase();
  return MERCH_COLORS.find((c) => c === key);
}

function sizeFromPill(text: string | null | undefined): MerchSize | undefined {
  if (!text) return undefined;
  const key = text.trim().toLowerCase();
  return MERCH_SIZES.find((s) => s === key);
}

/** When a merch PDP color changes, mark size pills that don't exist for the
 *  new color as soldout. If the currently-active pill becomes unavailable,
 *  unselect it and reset the size label so the user must repick. */
function refreshMerchSizesForActiveColor(slug: MerchSlug) {
  const activeSwatch = document.querySelector<HTMLElement>(".color-swatch.active");
  const color = colorFromTitle(activeSwatch?.getAttribute("title"));
  const allowed = new Set(availableSizesFor(slug, color));
  // No-op for slugs without a size dimension.
  if (allowed.size === 0) return;

  let unselectedActive = false;
  document.querySelectorAll<HTMLElement>(".size-pill").forEach((pill) => {
    const size = sizeFromPill(pill.textContent);
    if (!size) return;
    const isAllowed = allowed.has(size);
    pill.classList.toggle("soldout", !isAllowed);
    if (!isAllowed && pill.classList.contains("active")) {
      pill.classList.remove("active");
      unselectedActive = true;
    }
  });
  if (unselectedActive) {
    const sizeGroup = document.querySelectorAll<HTMLElement>(".option-group")[1];
    const label = sizeGroup?.querySelector<HTMLElement>(".option-label .selected");
    if (label) label.textContent = "Select size";
  }
}

/** Swap the merch gallery (main image + visible thumbs) to the chosen colorway.
 *  Each .gallery-thumb carries data-color + data-full; only thumbs matching the
 *  active color stay visible, and the main <img class="gallery-main-img"> follows
 *  the first visible thumb. No-ops on pages without a gallery. */
function swapGalleryForColor(color: MerchColor) {
  const thumbs = document.querySelectorAll<HTMLElement>(".gallery-thumb");
  if (!thumbs.length) return;
  thumbs.forEach((t) => {
    const match = t.dataset.color === color;
    t.style.display = match ? "" : "none";
    t.classList.remove("active");
  });
  const firstVisible = document.querySelector<HTMLElement>(
    `.gallery-thumb[data-color="${color}"]`,
  );
  if (!firstVisible) return;
  firstVisible.classList.add("active");
  const mainImg = document.querySelector<HTMLImageElement>(".gallery-main-img");
  if (mainImg && firstVisible.dataset.full) {
    swapMainImage(mainImg, firstVisible.dataset.full);
  }
}

/** Point the gallery main <img> at a new source. Critically, clears srcset +
 *  sizes: when an <img> has a srcset, the browser ignores .src, so a plain
 *  .src assignment silently does nothing (this is exactly why the Ritual PDP
 *  gallery — whose main img ships a srcset — appeared dead while the merch
 *  galleries, with no srcset, worked). */
function swapMainImage(mainImg: HTMLImageElement, src: string) {
  mainImg.src = src;
  mainImg.removeAttribute("srcset");
  mainImg.removeAttribute("sizes");
}

/** Flash + scroll the PDP option-groups to nudge a user who hit Add to Cart
 *  without a valid color/size selection. Inline style toggle keeps this CSS-free. */
function flashOptionGroups() {
  const groups = document.querySelectorAll<HTMLElement>(".option-group");
  groups.forEach((g) => {
    g.style.transition = "outline 0.32s ease-out";
    g.style.outline = "2px solid var(--orange, #f2682f)";
    g.style.outlineOffset = "8px";
  });
  window.setTimeout(() => {
    groups.forEach((g) => {
      g.style.outline = "2px solid transparent";
    });
  }, 640);
  window.setTimeout(() => {
    groups.forEach((g) => {
      g.style.removeProperty("outline");
      g.style.removeProperty("outline-offset");
      g.style.removeProperty("transition");
    });
  }, 1000);
  groups[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/**
 * Signup forms wired through the live runtime. The import helper rewrites each
 * form's dead inline `onsubmit="..."` to `data-mujo-form="<key>"`; this map
 * drives list assignment, the custom source label, and the optimistic success
 * message. All POST to /api/klaviyo/subscribe (single master list + profile
 * properties keyed by source). Add a new signup form by adding a row here plus
 * an onsubmit rewrite in lib/imported-html.ts.
 */
const SIGNUP_FORMS: Record<
  string,
  { list: string; source: string; success: string }
> = {
  "rebel-club": {
    list: "rebel_club",
    source: "Rebel Club signup",
    success: "You're in. First letter lands within 48 hours.",
  },
  "lemna-waitlist": {
    list: "lemna_waitlist",
    source: "Lemna waitlist",
    success: "You're on the founding-member list. Watch your inbox.",
  },
};

/**
 * UGC reel marquee (Ritual PDP) — auto-scrolls AND is manually scrollable.
 * The source markup ships a CSS keyframe marquee inside an `overflow:hidden`
 * viewport, so visitors can't scroll it themselves (hover only pauses it).
 * Here we switch the viewport to native horizontal scroll and drive the
 * auto-advance with rAF on `scrollLeft` instead — so swipe / drag / wheel all
 * work, auto-advance pauses while the visitor interacts (or hovers) and resumes
 * shortly after, and the duplicated track gives a seamless loop. Pauses when the
 * strip scrolls offscreen and honors prefers-reduced-motion (manual-only).
 * No-ops on pages without a `.reels-viewport`.
 */
function initReelsMarquee(): () => void {
  const viewport = document.querySelector<HTMLElement>(".reels-viewport");
  const track = viewport?.querySelector<HTMLElement>(".reel-track");
  if (!viewport || !track) return () => {};

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Hand scrolling to the browser; replace the CSS marquee with a rAF loop.
  viewport.style.overflowX = "auto";
  viewport.style.overflowY = "hidden";
  viewport
    .querySelectorAll<HTMLElement>(".reel-track")
    .forEach((t) => (t.style.animation = "none"));

  const ac = new AbortController();
  const signal = ac.signal;
  let paused = reduce; // reduced motion → manual scroll only, no auto-advance
  let onscreen = true;
  let raf = 0;
  let resumeTimer = 0;
  const SPEED = 0.5; // px per frame ≈ 30px/s, matching the original gentle drift

  const step = () => {
    if (!paused && onscreen) {
      const setWidth = track.getBoundingClientRect().width; // one tile-set
      viewport.scrollLeft += SPEED;
      if (setWidth > 0 && viewport.scrollLeft >= setWidth) {
        viewport.scrollLeft -= setWidth; // seamless wrap into the dup track
      }
    }
    raf = requestAnimationFrame(step);
  };

  const pause = () => {
    paused = true;
  };
  const resumeSoon = (delay = 1000) => {
    if (reduce) return;
    window.clearTimeout(resumeTimer);
    resumeTimer = window.setTimeout(() => {
      paused = false;
    }, delay);
  };

  viewport.addEventListener("pointerenter", pause, { signal });
  viewport.addEventListener("pointerleave", () => resumeSoon(400), { signal });
  viewport.addEventListener("pointerdown", pause, { signal });
  viewport.addEventListener("pointerup", () => resumeSoon(), { signal });
  viewport.addEventListener("touchstart", pause, { passive: true, signal });
  viewport.addEventListener("touchend", () => resumeSoon(), {
    passive: true,
    signal,
  });
  viewport.addEventListener(
    "wheel",
    () => {
      pause();
      resumeSoon();
    },
    { passive: true, signal },
  );

  let io: IntersectionObserver | undefined;
  if ("IntersectionObserver" in window) {
    io = new IntersectionObserver(
      (entries) => {
        onscreen = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0 },
    );
    io.observe(viewport);
  }

  raf = requestAnimationFrame(step);

  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(resumeTimer);
    io?.disconnect();
    ac.abort();
  };
}

/**
 * Client wrapper that activates the shared behaviors needed by imported
 * pages: scroll-reveal animations, and event delegation for `data-mujo-*`
 * action hooks (e.g. data-mujo-action="open-cart" / "checkout"). Also
 * strips inline `onclick` no-ops that the import helper already replaced.
 */
export function ImportedPageRuntime({ children }: ImportedPageRuntimeProps) {
  useReveal();
  const pathname = usePathname();
  const { open: openQuiz } = useQuizSheet();
  const { addItem } = useCart();

  useEffect(() => {
    // Initial-mount refresh: mark unavailable sizes as soldout based on the
    // HTML's default active color (e.g. Crew Bone defaults active in the source
    // HTML, so XS must render struck-through on first paint, not just after
    // the user changes color).
    const merchBtn = document.querySelector<HTMLElement>(
      '[data-mujo-action="add-to-cart-merch"]',
    );
    const initialSlug = merchBtn?.dataset.productHandle;
    if (isMerchSlug(initialSlug)) {
      refreshMerchSizesForActiveColor(initialSlug);
    }

    function onClick(ev: MouseEvent) {
      const target = ev.target as HTMLElement | null;
      if (!target) return;

      // Merch PDP interactivity. The source HTMLs ship inline <script> blocks
      // that the loader strips for safety; these handlers restore the four
      // behaviors via event delegation. Each branch is gated on `closest()`
      // so non-merch pages no-op.

      const accordionToggle = target.closest<HTMLElement>(".accordion-toggle");
      if (accordionToggle) {
        accordionToggle.closest(".accordion")?.classList.toggle("open");
        return;
      }

      const swatch = target.closest<HTMLElement>(".color-swatch");
      if (swatch) {
        const optionGroup = swatch.closest(".option-group");
        optionGroup
          ?.querySelectorAll(".color-swatch")
          .forEach((el) => el.classList.remove("active"));
        swatch.classList.add("active");
        const label = optionGroup?.querySelector(".option-label .selected");
        if (label) {
          label.textContent = swatch.getAttribute("title") ?? label.textContent;
        }
        // On merch PDPs, recompute size availability for the new color.
        // Crew Bone has no XS — see lib/cart/merch-config.ts.
        const merchBtn = document.querySelector<HTMLElement>(
          '[data-mujo-action="add-to-cart-merch"]',
        );
        const slug = merchBtn?.dataset.productHandle;
        if (isMerchSlug(slug)) {
          refreshMerchSizesForActiveColor(slug);
        }
        // Swap the gallery photos to the newly-selected colorway.
        const galleryColor = colorFromTitle(swatch.getAttribute("title"));
        if (galleryColor) swapGalleryForColor(galleryColor);
        return;
      }

      const pill = target.closest<HTMLElement>(".size-pill");
      if (pill) {
        if (pill.classList.contains("soldout")) return;
        const optionGroup = pill.closest(".option-group");
        optionGroup
          ?.querySelectorAll(".size-pill")
          .forEach((el) => el.classList.remove("active"));
        pill.classList.add("active");
        const label = optionGroup?.querySelector(".option-label .selected");
        if (label && pill.textContent) {
          label.textContent = pill.textContent.trim();
        }
        return;
      }

      const thumb = target.closest<HTMLElement>(".gallery-thumb");
      if (thumb) {
        thumb
          .closest(".gallery-thumbs")
          ?.querySelectorAll(".gallery-thumb")
          .forEach((el) => el.classList.remove("active"));
        thumb.classList.add("active");
        const mainImg = document.querySelector<HTMLImageElement>(".gallery-main-img");
        if (mainImg && thumb.dataset.full) {
          swapMainImage(mainImg, thumb.dataset.full);
        }
        return;
      }

      const trigger = target.closest<HTMLElement>("[data-mujo-action]");
      if (!trigger) return;
      const action = trigger.dataset.mujoAction;
      switch (action) {
        case "open-cart":
          ev.preventDefault();
          window.dispatchEvent(new CustomEvent("mujo:cart:open"));
          break;
        case "open-menu":
          ev.preventDefault();
          window.dispatchEvent(new CustomEvent("mujo:menu:open"));
          break;
        case "close-cart":
        case "close-menu":
        case "close-all":
          ev.preventDefault();
          window.dispatchEvent(new CustomEvent("mujo:overlay:close"));
          break;
        case "open-quiz": {
          ev.preventDefault();
          // Compound triggers (mobile menu's "Take the audit") also need the
          // menu drawer to close first. Cheap to dispatch unconditionally.
          window.dispatchEvent(new CustomEvent("mujo:overlay:close"));
          // Tag where the quiz was taken so the four shared result flows can be
          // attributed by page. Only / and /ritual are distinguished; any other
          // entry point (the site-wide pill) defaults to homepage_quiz.
          const quizSource =
            window.location.pathname === "/ritual"
              ? "ritual_landing_quiz"
              : "homepage_quiz";
          openQuiz(quizSource);
          break;
        }
        case "checkout": {
          ev.preventDefault();
          const priceId = trigger.dataset.stripePriceId;
          const isSubscription = trigger.dataset.mode === "subscription";
          if (!priceId) {
            // No price attached — just open the drawer (e.g. nav cart icon).
            window.dispatchEvent(new CustomEvent("mujo:cart:open"));
            return;
          }
          const resolved = resolvePriceId(priceId, { isSubscription });
          if (!resolved) {
            // Unknown Price ID. Surface to the console (so we can wire it
            // into price-id-map.ts) and still open the drawer so the click
            // doesn't feel dead.
            console.warn(
              `[imported-page-runtime] Unknown Stripe Price ID ${priceId} — wire it into lib/cart/price-id-map.ts.`,
            );
            window.dispatchEvent(new CustomEvent("mujo:cart:open"));
            return;
          }
          addItem({
            stripePriceId: priceId,
            ...resolved,
            quantity: 1,
          });
          // CartProvider's addItem dispatches mujo:cart:open already; no
          // explicit dispatch needed here.
          break;
        }
        case "add-to-cart-merch": {
          ev.preventDefault();
          const slug = trigger.dataset.productHandle;
          if (!isMerchSlug(slug)) {
            console.warn(
              "[merch-cart] missing or invalid data-product-handle on add-to-cart-merch trigger",
            );
            return;
          }
          const activeSwatch = document.querySelector<HTMLElement>(
            ".color-swatch.active",
          );
          const color = colorFromTitle(activeSwatch?.getAttribute("title"));
          const activePill = document.querySelector<HTMLElement>(
            ".size-pill.active",
          );
          const size = sizeFromPill(activePill?.textContent);
          const resolved = resolveMerchSelection(slug, color, size);
          if (!resolved) {
            // Either no size picked (tee/crew) or an asymmetric combo
            // (Crew + Bone + XS). Nudge the user back to the option groups.
            console.warn(
              `[merch-cart] no valid variant for ${slug} (color=${color}, size=${size})`,
            );
            flashOptionGroups();
            return;
          }
          addItem({
            stripePriceId: resolved.stripePriceId,
            ...resolved.line,
            quantity: 1,
          });
          break;
        }
        default:
          break;
      }
    }

    document.addEventListener("click", onClick);

    function handleForms(ev: SubmitEvent) {
      const form = ev.target as HTMLFormElement | null;
      if (!form) return;
      const formType = form.dataset.mujoForm;
      if (!formType) return;

      // Generic forms are intentionally inert (no native submit, no subscribe).
      if (formType === "generic") {
        ev.preventDefault();
        return;
      }

      const cfg = SIGNUP_FORMS[formType];
      if (!cfg) return;

      ev.preventDefault();
      const data = new FormData(form);
      const email = (data.get("email") || "").toString().trim();
      if (!email) return;

      const properties: Record<string, string> = {};
      const tribe = (data.get("tribe") || "").toString().trim();
      if (tribe) properties.mujo_tribe = tribe;

      // Optimistic UI: replace form with success message immediately.
      // color:inherit so it reads on both the dark footer and light sections.
      const successHtml =
        '<p style="font-family: var(--f-body); font-size: 15px; line-height: 1.5; color: inherit; margin: 0;">' +
        cfg.success +
        "</p>";
      form.outerHTML = successHtml;

      fetch("/api/klaviyo/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          list: cfg.list,
          source: cfg.source,
          properties,
        }),
      }).catch((err) => {
        // Failure logs server-side too. We've already shown success client-side
        // (Klaviyo dedup handles repeats; user can resubmit if it never arrives).
        console.warn(`[signup:${formType}] subscribe error`, err);
      });
    }
    document.addEventListener("submit", handleForms);

    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", handleForms);
    };
  }, [openQuiz, addItem]);

  // UGC reel marquee: make it manually scrollable while keeping auto-advance.
  useEffect(() => initReelsMarquee(), []);

  // Loox reviews: on PDP routes, stamp the numeric product ID onto the page's
  // Loox widget divs and (re)render. Keyed to pathname so client-side nav
  // between PDPs re-renders against the new product (Loox only scans on load).
  // No-ops on non-product routes.
  useEffect(() => {
    const slug = looxSlugFromPathname(pathname);
    if (slug) renderLooxForSlug(slug);
  }, [pathname]);

  return <>{children}</>;
}
