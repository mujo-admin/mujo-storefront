/**
 * <PaperGrain /> — page-wide turbulence noise overlay.
 * Used by Lemna trio + /science to add an analog texture under the design.
 * Render once at page level; pointer-events: none so it never intercepts clicks.
 */
export function PaperGrain() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        opacity: 0.04,
        mixBlendMode: "multiply",
        backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
      }}
    />
  );
}
