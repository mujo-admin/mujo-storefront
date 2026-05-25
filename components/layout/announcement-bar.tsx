"use client";

import { useEffect, useState } from "react";

type AnnouncementLine = {
  primary: React.ReactNode;
  /** Hidden on mobile (≤640px). Use for the secondary line per nav-system v1.0. */
  secondary?: React.ReactNode;
};

type AnnouncementBarProps = {
  lines?: AnnouncementLine[];
  intervalMs?: number;
};

const DEFAULT_LINES: AnnouncementLine[] = [
  {
    primary: (
      <>
        Free shipping over <strong>$100</strong>
      </>
    ),
    secondary: (
      <>
        Use <strong>WELCOME10</strong> for 10% off your first order
      </>
    ),
  },
];

/**
 * <AnnouncementBar /> — sage-bg sticky-above-nav strip.
 * Auto-rotates lines if more than one is provided.
 * Mobile collapses the secondary line per nav-system v1.0 spec.
 */
export function AnnouncementBar({
  lines = DEFAULT_LINES,
  intervalMs = 5000,
}: AnnouncementBarProps) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (lines.length <= 1) return;
    const id = setInterval(
      () => setIdx((i) => (i + 1) % lines.length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [lines.length, intervalMs]);

  const line = lines[idx]!;

  return (
    <div
      className="announce"
      style={{
        background: "var(--sage)",
        color: "#fff",
        textAlign: "center",
        padding: "9px 16px",
        fontSize: 12,
        letterSpacing: "0.01em",
        position: "relative",
        zIndex: 200,
        lineHeight: 1.4,
      }}
    >
      {line.primary}
      {line.secondary && (
        <>
          <span
            className="announce-secondary"
            style={{ opacity: 0.4, margin: "0 8px" }}
          >
            ·
          </span>
          <span className="announce-secondary">{line.secondary}</span>
        </>
      )}
      <style jsx>{`
        @media (max-width: 640px) {
          :global(.announce-secondary) {
            display: none;
          }
        }
        @media (min-width: 768px) {
          .announce {
            padding: 10px 24px !important;
            font-size: 13px !important;
          }
        }
      `}</style>
    </div>
  );
}
