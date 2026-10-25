/**
 * Global loading state shown during App Router navigation.
 * Renders instantly while server components stream + RSC payload arrives,
 * preventing blank-screen-during-navigation. Replaces the previous-page UI
 * the moment the user clicks a Link.
 *
 * It also shows for a moment on a first visit, while the page body streams in
 * after the header. It fills the whole screen (100svh) so the footer stays
 * below it: at 60vh the footer showed underneath and then jumped down when the
 * page arrived, a large layout shift on phones (2026-10-25 speed pass).
 */
export default function Loading() {
  return (
    <div
      style={{
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--cream)",
        padding: "48px 24px",
      }}
    >
      <img
        src="/images/logo/mujo-logo-clay.png"
        alt="Mujo"
        style={{
          height: 32,
          width: "auto",
          opacity: 0.85,
          animation: "mujo-pulse 1.6s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes mujo-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.95; }
        }
      `}</style>
    </div>
  );
}
