"use client";

import { useEffect } from "react";

/**
 * Catastrophic-failure boundary. Catches errors that propagate past
 * <RootLayout /> (or that happen inside the layout itself). Mirrors the
 * per-route error.tsx auto-reload behavior for chunk errors so users
 * never get stuck on a blank page after a deploy.
 *
 * Must render its own <html> + <body> per Next.js App Router contract.
 */
export default function GlobalError({
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
      msg.includes("chunkloaderror");
    if (isChunkError) {
      window.location.reload();
    }
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          background: "#F3F2E9",
          color: "#1A1A1A",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
          padding: "48px 24px",
          margin: 0,
        }}
      >
        <h2 style={{ fontSize: 24, fontWeight: 500, marginBottom: 12 }}>
          Something didn&apos;t load.
        </h2>
        <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 24, maxWidth: 420 }}>
          Refreshing the page usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            fontSize: 14,
            fontWeight: 500,
            padding: "12px 28px",
            borderRadius: 999,
            border: 0,
            background: "#F2682F",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
