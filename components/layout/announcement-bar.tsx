"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { duoOfferPublic } from "lib/duo-offer";

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
// Black Friday 2026: from Friday November 27 until the offer ends, the bar
// announces the Daily Ritual Duo instead of WELCOME10 (which cannot be combined
// with it). Switches itself on and off by the clock; see lib/duo-offer.ts.
const DUO_LINES: AnnouncementLine[] = [
  {
    primary: (
      <Link href="/duo" style={{ color: "inherit", textDecoration: "none" }}>
        The Daily Ritual Duo: The Ritual + Protein Powder for{" "}
        <strong>$89</strong>
      </Link>
    ),
    secondary: (
      <Link href="/duo" style={{ color: "inherit", textDecoration: "none" }}>
        Free frother and free shipping, until November 30
      </Link>
    ),
  },
];

export function AnnouncementBar({
  lines: linesProp,
  intervalMs = 5000,
}: AnnouncementBarProps) {
  const [idx, setIdx] = useState(0);
  // Checked after mount, so the server render and the first paint agree.
  const [duo, setDuo] = useState(false);
  useEffect(() => setDuo(duoOfferPublic()), []);
  const lines = linesProp ?? (duo ? DUO_LINES : DEFAULT_LINES);

  useEffect(() => {
    if (lines.length <= 1) return;
    const id = setInterval(
      () => setIdx((i) => (i + 1) % lines.length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [lines.length, intervalMs]);

  const line = lines[idx] ?? lines[0]!;

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
    </div>
  );
}
