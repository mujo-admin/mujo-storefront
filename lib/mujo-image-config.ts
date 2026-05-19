/**
 * Mujo image-system config.
 *
 * Shared by the variant generator (build-time) and `<MujoImage>` (render-time).
 * Width changes here must be paired with a re-run of `pnpm images:variants`.
 */

export const VARIANT_WIDTHS = [400, 800, 1200, 1920] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

export type SlotClass = "hero" | "card" | "thumb" | "inline";

/**
 * Responsive `sizes` strings keyed by slot class.
 *
 * The browser picks the closest variant from `srcSet` for the computed display
 * width. These are mobile-first — 640px breakpoint is the phone/tablet pivot,
 * 1024px is the tablet/desktop pivot.
 *
 * Refinement is welcome once route ports surface real layout widths — adjust
 * per-route via the `sizes` override prop if needed.
 */
export const SLOT_SIZES: Record<SlotClass, string> = {
  hero: "100vw",
  card: "(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 30vw",
  thumb: "120px",
  inline: "(max-width: 640px) 100vw, 50vw",
};

/**
 * Path prefix where variant files live, relative to the public root.
 * The variant generator writes here; the component reads here.
 */
export const RESPONSIVE_PREFIX = "/images/responsive";

/**
 * Source format extension served by the component. AVIF variants are also
 * generated (see `scripts/generate-image-variants.ts`) for a future progressive
 * upgrade via `<picture><source type="image/avif">` — not yet wired.
 */
export const PRIMARY_FORMAT = "webp" as const;
