/**
 * Phase 7: Lighthouse mobile baselines for the Phase 2-6 routes.
 * Uses the bundled `lighthouse` CLI binary as a subprocess (Lighthouse 13 is
 * ESM-only and tsx loads via CJS — programmatic API fails).
 */
import { execFileSync } from 'node:child_process'

const ROUTES = [
  { path: '/checkout', tag: 'NEW (Phase 2)' },
  { path: '/checkout/success', tag: 'NEW (Phase 2 — empty PI)' },
  { path: '/migration-complete', tag: 'NEW (Phase 6)' },
  { path: '/', tag: 'W3 baseline' },
  { path: '/products/mujo-ritual', tag: 'W3 baseline' },
  { path: '/ritual', tag: 'W3 baseline' },
  { path: '/shop', tag: 'W3 baseline' },
] as const

const BASE = 'https://mujo-storefront.vercel.app'
const CLI = 'node_modules/.bin/lighthouse'

function runOne(url: string): {
  perf: number
  a11y: number
  bp: number
  seo: number
  lcp: string
  fcp: string
  tbt: string
  cls: string
} {
  const stdout = execFileSync(
    CLI,
    [
      url,
      '--output=json',
      '--form-factor=mobile',
      '--quiet',
      '--only-categories=performance,accessibility,best-practices,seo',
      '--chrome-flags=--headless=new --no-sandbox',
    ],
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
  )
  const lhr = JSON.parse(stdout)
  const cats = lhr.categories
  const a = lhr.audits
  return {
    perf: Math.round((cats.performance?.score ?? 0) * 100),
    a11y: Math.round((cats.accessibility?.score ?? 0) * 100),
    bp: Math.round((cats['best-practices']?.score ?? 0) * 100),
    seo: Math.round((cats.seo?.score ?? 0) * 100),
    lcp: a['largest-contentful-paint']?.displayValue ?? '?',
    fcp: a['first-contentful-paint']?.displayValue ?? '?',
    tbt: a['total-blocking-time']?.displayValue ?? '?',
    cls: a['cumulative-layout-shift']?.displayValue ?? '?',
  }
}

console.log(
  'Route                                  | Perf | A11y | BP   | SEO  | LCP    | FCP    | TBT    | CLS    | Tag',
)
console.log('-'.repeat(140))
for (const r of ROUTES) {
  const url = BASE + r.path
  try {
    const s = runOne(url)
    const fmt = (n: number) => String(n).padStart(3)
    console.log(
      `${r.path.padEnd(38)} | ${fmt(s.perf)}  | ${fmt(s.a11y)}  | ${fmt(s.bp)}  | ${fmt(s.seo)}  | ${s.lcp.padEnd(7)}| ${s.fcp.padEnd(7)}| ${s.tbt.padEnd(7)}| ${s.cls.padEnd(7)}| ${r.tag}`,
    )
  } catch (e: unknown) {
    console.log(`${r.path.padEnd(38)} | ERROR ${(e as Error).message.slice(0, 80)}`)
  }
}
