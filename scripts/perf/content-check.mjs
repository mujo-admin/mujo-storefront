// Content check for imported pages: proves a change to the import helper did
// not drop anything visible. Loads each route at phone width, scrolls to the
// bottom (so lazy pictures and reveals fire), then records what is on the page
// and saves a full-page screenshot.
//
//   node scripts/perf/content-check.mjs snap <base_url> <out_dir>
//   node scripts/perf/content-check.mjs compare <before_dir> <after_dir>
//
// Compare lists every route where text, links, buttons, pictures, videos or
// FAQ items went down. Exit code 1 if anything dropped.
import { createRequire } from "module";
import fs from "fs";
import path from "path";

const require = createRequire(import.meta.url);
// puppeteer-core is a transitive dev dependency (via lighthouse), not hoisted.
const puppeteer = require(
  path.join(process.cwd(), "node_modules/.pnpm/puppeteer-core@24.43.0/node_modules/puppeteer-core"),
);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export const ROUTES = [
  "/", "/ritual", "/shop", "/protein-powder",
  "/products/mujo-ritual", "/products/protein-powder", "/products/mujo-frother",
  "/products/mujo-tee", "/products/mujo-hat", "/products/mujo-crew",
  "/about", "/ambassador", "/contact", "/ingredients", "/rebel-club",
  "/journal", "/journal/what-is-lemna-protein", "/journal/what-is-a-complete-protein",
  "/journal/what-bringing-mujo-to-market-taught-me",
  "/legal/privacy", "/legal/terms", "/legal/subscription-terms", "/legal/shipping",
  "/legal/returns", "/legal/cookies", "/legal/accessibility", "/legal/affiliate-disclosure",
];

async function snapRoute(browser, base, route, outDir) {
  const page = await browser.newPage();
  await page.setViewport({ width: 412, height: 823, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  // Pretend consent was given so the banner doesn't cover screenshots.
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem("mujo_consent", "granted"); } catch {}
  });
  const errors = [];
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" && /hydrat|did not match|Minified React error/i.test(t)) errors.push(t.slice(0, 300));
  });
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 300)));
  await page.goto(base + route, { waitUntil: "networkidle2", timeout: 90000 });
  // Scroll in steps so observers fire, then back to the top.
  await page.evaluate(async () => {
    const step = 600;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await new Promise((r) => setTimeout(r, 1500));
  const data = await page.evaluate(() => {
    const root = document.querySelector("main") || document.body;
    const visible = (el) => {
      const s = getComputedStyle(el);
      return s.display !== "none" && s.visibility !== "hidden";
    };
    const bgEls = [...root.querySelectorAll("*")].filter((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      // A data-bg picture inside a hidden block never loads (correctly), but
      // it is still on the page, so count it.
      return (bg && bg !== "none" && bg.includes("url(")) || el.hasAttribute("data-bg");
    });
    const brokenImgs = [...root.querySelectorAll("img")].filter(
      (im) => im.complete && im.naturalWidth === 0 && im.getAttribute("src"),
    ).map((im) => im.getAttribute("src"));
    const hidden = [...root.querySelectorAll(".reveal:not(.on)")].length;
    const text = (root.innerText || "").replace(/\s+/g, " ").trim();
    return {
      textLength: text.length,
      words: text.split(" ").length,
      headings: root.querySelectorAll("h1,h2,h3").length,
      links: root.querySelectorAll("a[href]").length,
      buttons: [...root.querySelectorAll("button,[data-mujo-action]")].filter(visible).length,
      imgs: root.querySelectorAll("img").length,
      bgPictures: bgEls.length,
      videos: root.querySelectorAll("video").length,
      faqItems: root.querySelectorAll("details, .faq-item, .faq-q, .accordion").length,
      sections: root.querySelectorAll("section").length,
      revealStillHidden: hidden,
      brokenImgs,
      h1: (root.querySelector("h1")?.innerText || "").trim().slice(0, 120),
      textSample: text.slice(0, 20000),
    };
  });
  data.errors = errors;
  const safe = route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "__");
  await page.screenshot({ path: path.join(outDir, `${safe}.png`), fullPage: true }).catch(() => {});
  await page.close();
  return data;
}

async function snap(base, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
  const out = {};
  for (const r of ROUTES) {
    try {
      out[r] = await snapRoute(browser, base, r, outDir);
      const d = out[r];
      console.log(`${r.padEnd(52)} words ${d.words} links ${d.links} btn ${d.buttons} img ${d.imgs} bg ${d.bgPictures} vid ${d.videos} faq ${d.faqItems} hidden ${d.revealStillHidden} errs ${d.errors.length}`);
    } catch (e) {
      out[r] = { error: e.message };
      console.log(`${r} FAILED ${e.message}`);
    }
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, "content.json"), JSON.stringify(out, null, 1));
}

function compare(beforeDir, afterDir) {
  const a = JSON.parse(fs.readFileSync(path.join(beforeDir, "content.json")));
  const b = JSON.parse(fs.readFileSync(path.join(afterDir, "content.json")));
  const keys = ["words", "headings", "links", "buttons", "imgs", "bgPictures", "videos", "faqItems", "sections"];
  let problems = 0;
  for (const r of Object.keys(a)) {
    const x = a[r], y = b[r];
    if (!y || y.error) { console.log(`✗ ${r}: missing or failed after`); problems++; continue; }
    if (x.error) continue;
    const drops = keys.filter((k) => (y[k] ?? 0) < (x[k] ?? 0)).map((k) => `${k} ${x[k]}→${y[k]}`);
    // Words can wobble by a handful (dynamic review counts, dates).
    const wordDrop = x.words - y.words;
    const realDrops = drops.filter((d) => !(d.startsWith("words") && wordDrop <= 5));
    const extra = [];
    if (y.h1 !== x.h1) extra.push(`h1 changed: "${x.h1}" → "${y.h1}"`);
    if (y.brokenImgs?.length) extra.push(`broken images: ${y.brokenImgs.join(", ")}`);
    if (y.errors?.length) extra.push(`console errors: ${y.errors.join(" | ")}`);
    if (realDrops.length || extra.length) {
      problems++;
      console.log(`✗ ${r}: ${[...realDrops, ...extra].join("; ")}`);
    } else {
      console.log(`✓ ${r}`);
    }
  }
  console.log(problems ? `\n${problems} route(s) need a look` : "\nAll routes match or improved");
  process.exit(problems ? 1 : 0);
}

const [mode, p1, p2] = process.argv.slice(2);
if (mode === "snap") await snap(p1, p2);
else if (mode === "compare") compare(p1, p2);
else console.log("usage: snap <base> <out> | compare <before> <after>");
