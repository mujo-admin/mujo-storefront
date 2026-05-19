import Image, { type ImageProps } from "next/image";
import lqipMapRaw from "lib/lqip-map.json";
import {
  PRIMARY_FORMAT,
  RESPONSIVE_PREFIX,
  SLOT_SIZES,
  VARIANT_WIDTHS,
  type SlotClass,
  type VariantWidth,
} from "lib/mujo-image-config";

interface LqipEntry {
  lqip: string;
  width: number;
  height: number;
  color: string;
}
const lqipMap = lqipMapRaw as Record<string, LqipEntry>;

export interface MujoImageProps {
  /**
   * Path relative to `public/images/`, with extension.
   *   e.g. `"products/ritual/ritual-pouch-hero-monumental-editorial-1x1.webp"`
   *
   * Must have a matching LQIP entry (from `lib/lqip-map.json`) and matching
   * variant files (from `pnpm images:variants`). Both regenerate via
   * `pnpm images:all`.
   */
  slug: string;
  alt: string;
  slot: SlotClass;
  priority?: boolean;
  /** Optional `sizes` override — by default `SLOT_SIZES[slot]`. */
  sizes?: string;
  /** Extra className applied to the `<img>` element. */
  className?: string;
  /**
   * Aspect-ratio CSS class for the *wrapper*, when the slot expects a different
   * crop than the source's intrinsic ratio. Pass via the consuming route's
   * styles — `<MujoImage>` itself does not wrap; it renders the `<img>` only.
   * (The route's existing inline CSS or class controls the slot box.)
   */
  /** Fetch priority — overrides priority. Defaults to `auto`. */
  fetchPriority?: ImageProps["fetchPriority"];
}

function buildLoader(slug: string) {
  const slugNoExt = slug.replace(/\.[a-zA-Z0-9]+$/, "");
  return ({ width }: { src: string; width: number; quality?: number }) => {
    // Pick the nearest configured variant ≥ requested width; fall back to largest.
    const widths: readonly VariantWidth[] = VARIANT_WIDTHS;
    const chosen: VariantWidth =
      widths.find((v) => v >= width) ?? widths[widths.length - 1]!;
    return `${RESPONSIVE_PREFIX}/${slugNoExt}-${chosen}.${PRIMARY_FORMAT}`;
  };
}

/**
 * Mujo's responsive image primitive.
 *
 * Wraps Next.js `<Image>` with:
 * - srcSet from offline-generated variants in `public/images/responsive/`
 *   (custom loader; no `/_next/image` runtime path).
 * - LQIP blur placeholder from `lib/lqip-map.json` (build-time plaiceholder).
 * - Intrinsic `width` + `height` from the source webp metadata (CLS prevention).
 * - `sizes` keyed by slot class for correct variant negotiation per viewport.
 */
export function MujoImage({
  slug,
  alt,
  slot,
  priority = false,
  sizes,
  className,
  fetchPriority,
}: MujoImageProps) {
  const entry = lqipMap[slug];
  if (!entry) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(
        `[MujoImage] No LQIP entry for slug "${slug}". Run \`pnpm images:lqip\`.`,
      );
    } else {
      throw new Error(
        `[MujoImage] No LQIP entry for slug "${slug}". Did you run \`pnpm images:all\`?`,
      );
    }
  }

  const slugNoExt = slug.replace(/\.[a-zA-Z0-9]+$/, "");
  const fallbackSrc = `${RESPONSIVE_PREFIX}/${slugNoExt}-1920.${PRIMARY_FORMAT}`;

  // If the LQIP entry is missing, render a plain `<img>` fallback with no blur.
  // (Dev-only path — production throws above.)
  if (!entry) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fallbackSrc}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={fetchPriority ?? (priority ? "high" : "auto")}
        className={className}
      />
    );
  }

  return (
    <Image
      loader={buildLoader(slug)}
      src={fallbackSrc /* ignored by loader, required by Image */}
      alt={alt}
      width={entry.width}
      height={entry.height}
      sizes={sizes ?? SLOT_SIZES[slot]}
      placeholder="blur"
      blurDataURL={entry.lqip}
      priority={priority}
      fetchPriority={fetchPriority}
      className={className}
    />
  );
}
