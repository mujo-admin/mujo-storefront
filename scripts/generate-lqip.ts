#!/usr/bin/env tsx
/**
 * LQIP (Low Quality Image Placeholder) generator.
 *
 * Walks `public/images/**` for source `.webp` files (excluding `responsive/`
 * and `logo/`) and writes `lib/lqip-map.json` keyed by relative-path-from-
 * `public/images/`:
 *
 *   {
 *     "products/ritual/ritual-pouch-hero-monumental-editorial-1x1.webp": {
 *       "lqip": "data:image/webp;base64,...",
 *       "width": 1856,
 *       "height": 1856,
 *       "color": "#a47853"
 *     },
 *     ...
 *   }
 *
 * Output is stable per-source: re-running on unchanged sources yields no diff.
 *
 * Usage:
 *   pnpm tsx scripts/generate-lqip.ts
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import { existsSync } from "node:fs";
import { getPlaiceholder } from "plaiceholder";

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "public", "images");
const OUT_PATH = join(ROOT, "lib", "lqip-map.json");
const EXCLUDE_DIRS = new Set(["responsive", "logo"]);

export interface LqipEntry {
  lqip: string;
  width: number;
  height: number;
  color: string;
}
export type LqipMap = Record<string, LqipEntry>;

async function walk(dir: string, accum: string[] = []): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      await walk(full, accum);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".webp")) {
      accum.push(full);
    }
  }
  return accum;
}

async function main() {
  console.log("▶ LQIP generator");
  console.log(`  Source: ${relative(ROOT, SRC_DIR)}/`);
  console.log(`  Output: ${relative(ROOT, OUT_PATH)}`);
  console.log();

  if (!existsSync(SRC_DIR)) {
    console.error(`✗ source dir does not exist: ${SRC_DIR}`);
    process.exit(1);
  }

  const sources = (await walk(SRC_DIR)).sort();
  console.log(`Found ${sources.length} source webp(s).\n`);

  const map: LqipMap = {};
  const t0 = Date.now();
  let totalBase64Bytes = 0;
  for (const src of sources) {
    const key = relative(SRC_DIR, src).split("\\").join("/"); // POSIX key regardless of OS
    const buf = await readFile(src);
    const { base64, metadata, color } = await getPlaiceholder(buf, { size: 10 });
    map[key] = {
      lqip: base64,
      width: metadata.width,
      height: metadata.height,
      color: color.hex,
    };
    totalBase64Bytes += base64.length;
    console.log(`  ${key} → ${metadata.width}×${metadata.height} (${base64.length} chars)`);
  }

  // Stable key order for clean diffs.
  const sortedEntries = Object.fromEntries(
    Object.entries(map).sort(([a], [b]) => a.localeCompare(b)),
  );

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(sortedEntries, null, 2) + "\n", "utf8");

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log();
  console.log(`✓ Done in ${dt}s — wrote ${sources.length} entries (${(totalBase64Bytes / 1024).toFixed(1)} KB base64 total)`);
}

main().catch((err) => {
  console.error("✗ generator failed:", err);
  process.exit(1);
});
