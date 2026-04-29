"use client";

import { useEffect } from "react";

/**
 * Mounts a single IntersectionObserver that toggles `.on` on every `.reveal`
 * element when it scrolls into view. Mirrors the inline pattern used across
 * the 28 source HTMLs — consolidated to one hook.
 *
 * Usage: call `useReveal()` once at the top of a client component (or page).
 * Add `className="reveal"` (optionally with `d1`–`d6` for stagger) to any
 * element you want to animate in.
 */
export function useReveal(threshold = 0.1) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!("IntersectionObserver" in window)) {
      document
        .querySelectorAll<HTMLElement>(".reveal")
        .forEach((el) => el.classList.add("on"));
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("on");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold },
    );

    document
      .querySelectorAll<HTMLElement>(".reveal:not(.on)")
      .forEach((el) => obs.observe(el));

    return () => obs.disconnect();
  }, [threshold]);
}
