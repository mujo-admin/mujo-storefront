"use client";

import { useEffect } from "react";

/**
 * Lazy pictures and videos for imported pages (see docs/performance.md).
 *
 * lib/imported-html.ts moves every below-the-first-screen inline background
 * picture to `data-bg="<url>"` and turns autoplay videos into
 * `<video preload="none" data-autoplay>`. This hook:
 *   - sets each `data-bg` picture when it comes within 800px of the screen,
 *     so it is already there when the visitor scrolls to it;
 *   - plays each `data-autoplay` video while at least a quarter of it is on
 *     screen, and pauses it when it leaves (poster shows until then).
 *
 * `key` re-runs the scan after a client-side navigation.
 */
export function useLazyMedia(key?: string) {
  useEffect(() => {
    const bgEls = Array.from(
      document.querySelectorAll<HTMLElement>("[data-bg]:not([data-bg-done])"),
    );
    const videos = Array.from(
      document.querySelectorAll<HTMLVideoElement>("video[data-autoplay]"),
    );
    const posters = Array.from(
      document.querySelectorAll<HTMLVideoElement>("video[data-poster]:not([poster])"),
    );

    const showBg = (el: HTMLElement) => {
      const url = el.dataset.bg;
      if (url) el.style.backgroundImage = `url("${url}")`;
      el.setAttribute("data-bg-done", "");
    };
    const play = (v: HTMLVideoElement) => {
      v.muted = true;
      const p = v.play();
      if (p) p.catch(() => {});
    };

    const showPoster = (v: HTMLVideoElement) => {
      if (v.dataset.poster) v.poster = v.dataset.poster;
    };

    if (!("IntersectionObserver" in window)) {
      bgEls.forEach(showBg);
      posters.forEach(showPoster);
      videos.forEach(play);
      return;
    }

    // A tile inside a sideways carousel only "intersects" once swiped into
    // view (the carousel clips it), which would show blank tiles mid-swipe.
    // So watch the carousel itself and load all its pictures together.
    const scrollerOf = (el: HTMLElement): HTMLElement | null => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === "auto" || ox === "scroll") return p;
      }
      return null;
    };
    const groups = new Map<Element, HTMLElement[]>();
    for (const el of bgEls) {
      const target = scrollerOf(el) ?? el;
      const list = groups.get(target);
      if (list) list.push(el);
      else groups.set(target, [el]);
    }

    const bgObs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          groups.get(e.target)?.forEach(showBg);
          bgObs.unobserve(e.target);
        }
      },
      { rootMargin: "800px 0px" },
    );
    groups.forEach((_els, target) => bgObs.observe(target));

    // Video covers: the review strip is a moving marquee (two copies of the
    // set, the second starting off screen) whose cards clip their own video,
    // so a card only "intersects" once it slides in. Watch the section the
    // strip sits in and give every video in it its cover at once.
    const clipperOf = (el: HTMLElement): HTMLElement | null =>
      el.closest<HTMLElement>("section") ?? el.parentElement;
    const posterGroups = new Map<Element, HTMLVideoElement[]>();
    for (const v of posters) {
      const target = clipperOf(v) ?? v;
      const list = posterGroups.get(target);
      if (list) list.push(v);
      else posterGroups.set(target, [v]);
    }
    const posterObs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          posterGroups.get(e.target)?.forEach(showPoster);
          posterObs.unobserve(e.target);
        }
      },
      { rootMargin: "800px 0px" },
    );
    posterGroups.forEach((_v, target) => posterObs.observe(target));

    const vidObs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (e.isIntersecting) play(v);
          else v.pause();
        }
      },
      { threshold: 0.25 },
    );
    videos.forEach((v) => vidObs.observe(v));

    return () => {
      posterObs.disconnect();
      bgObs.disconnect();
      vidObs.disconnect();
    };
  }, [key]);
}
