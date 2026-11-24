// POST /api/csp-report
//
// Browsers send a report here each time a page loads something the
// Content-Security-Policy (report-only, see next.config.ts) would have
// blocked. Nothing is stored: each report becomes ONE short line in the
// server log, so a week of logs shows which hosts the policy still misses.
//
//   vercel logs --query "[csp-report]"
//
// The endpoint is public by nature, so it trusts nothing: the body is capped,
// only a few short fields are kept, and browser-extension noise is dropped.

import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024;

// Reports caused by the visitor's own browser extensions or injected by
// antivirus and translation tools: not something the site loaded.
const NOISE =
  /^(chrome-extension|moz-extension|safari-extension|safari-web-extension|ms-browser-extension|webkit-masked-url|about|chrome|resource|translate\.googleapis\.com)/i;

type Report = {
  directive: string;
  blocked: string;
  page: string;
};

function clean(value: unknown, max = 200): string {
  return typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ").slice(0, max) : "";
}

/** Host of the blocked thing (or its keyword: inline, eval, data). */
function blockedOrigin(raw: string): string {
  try {
    const url = new URL(raw);
    // Extension and other non-web schemes have no origin ("null"): keep the
    // scheme so the noise filter can recognise them.
    return url.origin === "null" ? `${url.protocol}//` : url.origin;
  } catch {
    return raw;
  }
}

/** Path only: a full URL can carry checkout session ids. */
function pagePath(raw: string): string {
  try {
    return new URL(raw).pathname;
  } catch {
    return "";
  }
}

function fromLegacy(body: Record<string, unknown>): Report | null {
  const r = body["csp-report"];
  if (!r || typeof r !== "object") return null;
  const rec = r as Record<string, unknown>;
  return {
    directive: clean(rec["effective-directive"] ?? rec["violated-directive"], 60),
    blocked: blockedOrigin(clean(rec["blocked-uri"])),
    page: pagePath(clean(rec["document-uri"], 500)),
  };
}

function fromReportingApi(entry: unknown): Report | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  if (e.type !== "csp-violation" || !e.body || typeof e.body !== "object") return null;
  const b = e.body as Record<string, unknown>;
  return {
    directive: clean(b.effectiveDirective, 60),
    blocked: blockedOrigin(clean(b.blockedURL)),
    page: pagePath(clean(b.documentURL, 500)),
  };
}

export async function POST(req: NextRequest) {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return new Response(null, { status: 204 });

  let parsed: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return new Response(null, { status: 204 });
    parsed = JSON.parse(text);
  } catch {
    return new Response(null, { status: 204 });
  }

  const reports: Report[] = [];
  if (Array.isArray(parsed)) {
    for (const entry of parsed.slice(0, 5)) {
      const r = fromReportingApi(entry);
      if (r) reports.push(r);
    }
  } else if (parsed && typeof parsed === "object") {
    const r = fromLegacy(parsed as Record<string, unknown>);
    if (r) reports.push(r);
  }

  for (const r of reports) {
    if (!r.directive || NOISE.test(r.blocked)) continue;
    console.log(`[csp-report] ${r.directive} blocked=${r.blocked || "(none)"} page=${r.page || "?"}`);
  }

  // Always the same empty answer: nothing to learn from probing it.
  return new Response(null, { status: 204 });
}
