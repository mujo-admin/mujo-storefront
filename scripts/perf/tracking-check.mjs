// Tracking check: loads a page like a visitor, scrolls, taps Add to cart, and
// lists every hit sent to GA4, Meta and Klaviyo, so a change to tag loading can
// be proven to send each event exactly once.
//   node scripts/perf/tracking-check.mjs <base_url> [path=/ritual]
import { createRequire } from "module";
import path from "path";
const require = createRequire(import.meta.url);
const puppeteer = require(
  path.join(process.cwd(), "node_modules/.pnpm/puppeteer-core@24.43.0/node_modules/puppeteer-core"),
);
const base = process.argv[2] || "http://localhost:3100";
const route = process.argv[3] || "/ritual";
// Meta's pixel ignores automated browsers, so look like a normal phone.
const b = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--disable-blink-features=AutomationControlled"],
});
const p = await b.newPage();
await p.setViewport({ width: 412, height: 823, isMobile: true, hasTouch: true });
await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1");
await p.evaluateOnNewDocument(() => Object.defineProperty(navigator, "webdriver", { get: () => false }));
const hits = [];
if (process.env.DEBUG) p.on("console", (m) => console.log("console:", m.type(), m.text().slice(0, 160)));
if (process.env.DEBUG) p.on("requestfailed", (r) => console.log("failed:", r.url().slice(0, 100), r.failure()?.errorText));
const t0 = Date.now();
p.on("request", (r) => {
  const u = r.url();
  const at = Date.now() - t0;
  if (/google-analytics\.com\/(g\/)?collect/.test(u)) {
    const q = new URL(u).searchParams;
    const body = r.postData() || "";
    const events = [q.get("en"), ...body.split("\n").map((l) => new URLSearchParams(l).get("en"))].filter(Boolean);
    for (const e of events) hits.push({ at, to: "GA4", event: e });
  } else if (/facebook\.com\/tr/.test(u)) {
    const q = new URL(u).searchParams;
    const ev = q.get("ev") || new URLSearchParams(r.postData() || "").get("ev");
    hits.push({ at, to: "Meta", event: ev });
  } else if (/klaviyo\.com\/client\/(events|profiles)|a\.klaviyo\.com\/client/.test(u)) {
    let ev = "?";
    try { ev = JSON.parse(r.postData() || "{}")?.data?.attributes?.metric?.data?.attributes?.name || JSON.parse(r.postData()||"{}")?.data?.type; } catch {}
    hits.push({ at, to: "Klaviyo", event: ev });
  } else if (/googletagmanager\.com\/(gtag|gtm)|fbevents\.js|klaviyo\.js/.test(u)) {
    hits.push({ at, to: "library", event: u.split("/").pop().slice(0, 40) });
  }
});
await p.goto(base + route, { waitUntil: "load" });
await new Promise((r) => setTimeout(r, 2500));
await p.evaluate(() => window.scrollBy(0, 400));
await new Promise((r) => setTimeout(r, 5000));
await p.evaluate(() => document.querySelector(".atc-btn")?.click());
await new Promise((r) => setTimeout(r, 6000));
// Leaving the page flushes GA4's batched events.
await p.goto("about:blank");
await new Promise((r) => setTimeout(r, 1500));
await b.close();
for (const h of hits) console.log(String(h.at).padStart(6), "ms ", h.to.padEnd(8), h.event);
const count = (to, ev) => hits.filter((h) => h.to === to && h.event === ev).length;
console.log("\nGA4 page_view", count("GA4", "page_view"), "| GA4 add_to_cart", count("GA4", "add_to_cart"),
  "| Meta PageView", count("Meta", "PageView"), "| Meta AddToCart", count("Meta", "AddToCart"),
  "| Klaviyo Added to Cart", count("Klaviyo", "Added to Cart"),
  "\n(Klaviyo only records visitors it can identify, so an anonymous run shows 0 there.)");
