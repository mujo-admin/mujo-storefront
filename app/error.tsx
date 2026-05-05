"use client";

import { useEffect } from "react";

/**
 * Per-route error boundary.
 * Auto-recovers from common deploy-related chunk-load errors by forcing
 * a full page reload (gets fresh JS bundles). Otherwise shows a manual
 * retry UI matching brand tokens.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const msg = `${error?.name || ""} ${error?.message || ""}`.toLowerCase();
    const isChunkError =
      msg.includes("loading chunk") ||
      msg.includes("loading css chunk") ||
      msg.includes("failed to fetch dynamically imported module") ||
      msg.includes("import()") ||
      msg.includes("chunkloaderror");
    if (isChunkError) {
      // Stale client bundle after a deploy — force a hard reload to pull
      // fresh chunks. window.location.reload() bypasses Next router entirely.
      window.location.reload();
    }
  }, [error]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        background: "var(--cream)",
        padding: "48px 24px",
      }}
    >
      <img
        src="/images/logo/mujo-logo-orange.png"
        alt="Mujo"
        style={{ height: 28, width: "auto", marginBottom: 24, opacity: 0.85 }}
      />
      <h2
        style={{
          fontFamily: "var(--f-display)",
          fontSize: 24,
          fontWeight: 500,
          color: "var(--ink)",
          marginBottom: 12,
          letterSpacing: "-0.01em",
        }}
      >
        Something didn&apos;t load.
      </h2>
      <p
        style={{
          fontFamily: "var(--f-body)",
          fontSize: 15,
          lineHeight: 1.6,
          color: "var(--ink-soft)",
          maxWidth: 420,
          marginBottom: 24,
        }}
      >
        A glitch on our end. Try again — usually that&apos;s all it takes.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        style={{
          fontFamily: "var(--f-body)",
          fontSize: 14,
          fontWeight: 500,
          padding: "12px 28px",
          borderRadius: 999,
          border: 0,
          background: "var(--orange)",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Try again
      </button>
    </div>
  );
}
