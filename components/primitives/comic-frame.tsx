import type { ReactNode } from "react";

type ComicFrameProps = {
  children: ReactNode;
  variant?: "sage" | "orange" | "cream";
  rotate?: "left" | "right" | "none";
  className?: string;
};

/**
 * <ComicFrame /> — analog comic-art panel frame.
 * 2px ink border + 8px solid drop-shadow + halftone dot mask + 1deg rotation.
 * Used on Lemna + Science to frame illustrations and chart containers.
 */
export function ComicFrame({
  children,
  variant = "sage",
  rotate = "none",
  className = "",
}: ComicFrameProps) {
  const shadowColor =
    variant === "orange"
      ? "var(--orange)"
      : variant === "cream"
        ? "var(--sand-deep)"
        : "var(--sage)";

  const rotateValue =
    rotate === "left" ? "-1deg" : rotate === "right" ? "1deg" : "0deg";

  return (
    <div
      className={`mujo-comic-frame ${className}`}
      style={{
        position: "relative",
        border: "2px solid var(--ink)",
        background: "var(--cream)",
        boxShadow: `8px 8px 0 ${shadowColor}`,
        transform: `rotate(${rotateValue})`,
        padding: "var(--space-3)",
        borderRadius: "var(--radius-card)",
      }}
    >
      {children}
    </div>
  );
}
