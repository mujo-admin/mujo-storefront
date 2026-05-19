/**
 * Phase 7: 3-run Lighthouse average for routes flagged as regressions.
 * Single-run scores are ±10 noisy — 3-run avg gives directional confidence.
 */
import { execFileSync } from 'node:child_process'

const ROUTES = ['/ritual', '/shop', '/products/mujo-ritual', '/'] as const
const RUNS = 3
const BASE = 'https://mujo-storefront.vercel.app'
const CLI = 'node_modules/.bin/lighthouse'

type Run = { perf: number; lcp: number; cls: number; seo: number; bp: number }

function runOne(url: string): Run {
  const stdout = execFileSync(
    CLI,
    [
      url,
      '--output=json',
      '--form-factor=mobile',
      '--quiet',
      '--only-categories=performance,best-practices,seo',
      '--chrome-flags=--headless=new --no-sandbox',
    ],
    { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 },
  )
  const lhr = JSON.parse(stdout)
  return {
    perf: Math.round((lhr.categories.performance?.score ?? 0) * 100),
    bp: Math.round((lhr.categories['best-practices']?.score ?? 0) * 100),
    seo: Math.round((lhr.categories.seo?.score ?? 0) * 100),
    lcp: lhr.audits['largest-contentful-paint']?.numericValue ?? 0,
    cls: lhr.audits['cumulative-layout-shift']?.numericValue ?? 0,
  }
}

const fmt = (n: number) => String(Math.round(n)).padStart(3)
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

console.log(
  'Route                      | Run | Perf | BP  | SEO | LCP(ms) | CLS    ',
)
console.log('-'.repeat(80))

for (const path of ROUTES) {
  const url = BASE + path
  const runs: Run[] = []
  for (let i = 1; i <= RUNS; i++) {
    try {
      const r = runOne(url)
      runs.push(r)
      console.log(
        `${path.padEnd(26)} | ${i}/${RUNS} | ${fmt(r.perf)}  | ${fmt(r.bp)} | ${fmt(r.seo)} | ${fmt(r.lcp)}    | ${r.cls.toFixed(3)}`,
      )
    } catch (e: unknown) {
      console.log(`${path.padEnd(26)} | ${i}/${RUNS} | ERROR ${(e as Error).message.slice(0, 50)}`)
    }
  }
  if (runs.length > 0) {
    console.log(
      `${path.padEnd(26)} | AVG | ${fmt(avg(runs.map((r) => r.perf)))}  | ${fmt(avg(runs.map((r) => r.bp)))} | ${fmt(avg(runs.map((r) => r.seo)))} | ${fmt(avg(runs.map((r) => r.lcp)))}    | ${avg(runs.map((r) => r.cls)).toFixed(3)}`,
    )
    console.log('-'.repeat(80))
  }
}
