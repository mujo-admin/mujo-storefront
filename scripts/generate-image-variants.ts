#!/usr/bin/env tsx
/**
 * Offline responsive variant generator.
 *
 * Walks `public/images/**` for source `.webp` files (excluding `responsive/`
 * and `logo/`) and emits 400 / 800 / 1200 / 1920w variants in WebP + AVIF
 * into `public/images/responsive/{relative-path-without-ext}-{w}.{ext}`.
 *
 * Idempotent — skips outputs whose mtime is at-or-newer than the source.
 *
 * Usage:
 *   pnpm tsx scripts/generate-image-variants.ts              # full run
 *   pnpm tsx scripts/generate-image-variants.ts --dry-run    # preview, no writes
 *   pnpm tsx scripts/generate-image-variants.ts --only path  # single source filter
 *   pnpm tsx scripts/generate-image-variants.ts --force      # overwrite existing
 */
import { readdir, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, dirname, basename, extname, posix } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "public", "images");
const OUT_DIR = join(SRC_DIR, "responsive");
const EXCLUDE_DIRS = new Set(["responsive", "logo"]);

const WIDTHS = [400, 800, 1200, 1920] as const;
const FORMATS = [
  { ext: "webp", quality: 78 },
  { ext: "avif", quality: 55 },
] as const;

type Flags = { dryRun: boolean; only: string | null; force: boolean };

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { dryRun: false, only: null, force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") flags.dryRun = true;
    else if (a === "--force") flags.force = true;
    else if (a === "--only") flags.only = argv[++i] ?? null;
  }
  return flags;
}

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

function outputPath(src: string, width: number, ext: string): string {
  const rel = relative(SRC_DIR, src);                // e.g. products/ritual/foo.webp
  const stem = rel.slice(0, rel.length - extname(rel).length); // products/ritual/foo
  return join(OUT_DIR, `${stem}-${width}.${ext}`);
}

async function isOutputFresh(srcPath: string, outPath: string): Promise<boolean> {
  if (!existsSync(outPath)) return false;
  const [s, o] = await Promise.all([stat(srcPath), stat(outPath)]);
  return o.mtimeMs >= s.mtimeMs;
}

async function processSource(srcPath: string, flags: Flags) {
  const srcRel = relative(SRC_DIR, srcPath);
  const buf = await sharp(srcPath).toBuffer();
  const meta = await sharp(buf).metadata();
  const srcWidth = meta.width ?? 1920;
  let written = 0;
  let skipped = 0;
  let bytesOut = 0;

  for (const w of WIDTHS) {
    // Don't upscale — if source is narrower than target, clamp to source width.
    const targetW = Math.min(w, srcWidth);
    for (const { ext, quality } of FORMATS) {
      const out = outputPath(srcPath, w, ext);
      if (!flags.force && (await isOutputFresh(srcPath, out))) {
        skipped++;
        continue;
      }
      if (flags.dryRun) {
        console.log(`  [dry] would write ${posix.normalize(relative(ROOT, out))} (${targetW}w ${ext})`);
        continue;
      }
      await mkdir(dirname(out), { recursive: true });
      const pipeline = sharp(buf).resize({ width: targetW, withoutEnlargement: true });
      if (ext === "webp") {
        await pipeline.webp({ quality, effort: 6 }).toFile(out);
      } else {
        await pipeline.avif({ quality, effort: 6 }).toFile(out);
      }
      const s = await stat(out);
      bytesOut += s.size;
      written++;
    }
  }
  return { srcRel, written, skipped, bytesOut };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  console.log(`▶ Variant generator${flags.dryRun ? " (dry-run)" : ""}${flags.force ? " (force)" : ""}`);
  console.log(`  Source: ${relative(ROOT, SRC_DIR)}/`);
  console.log(`  Output: ${relative(ROOT, OUT_DIR)}/`);
  console.log(`  Widths: ${WIDTHS.join(", ")}`);
  console.log(`  Formats: ${FORMATS.map((f) => `${f.ext}@q${f.quality}`).join(", ")}`);
  console.log();

  if (!existsSync(SRC_DIR)) {
    console.error(`✗ source dir does not exist: ${SRC_DIR}`);
    process.exit(1);
  }

  const t0 = Date.now();
  let sources = await walk(SRC_DIR);
  if (flags.only) {
    const target = flags.only.replace(/^public\/images\//, "");
    sources = sources.filter((s) => relative(SRC_DIR, s) === target);
    if (sources.length === 0) {
      console.error(`✗ --only filter matched zero sources: ${flags.only}`);
      console.error(`  (filter must match relative path under public/images/, e.g. ingredients/lions-mane-macro-editorial-1x1.webp)`);
      process.exit(1);
    }
  }

  console.log(`Found ${sources.length} source webp(s).\n`);

  let totalWritten = 0;
  let totalSkipped = 0;
  let totalBytes = 0;
  for (const src of sources) {
    const r = await processSource(src, flags);
    totalWritten += r.written;
    totalSkipped += r.skipped;
    totalBytes += r.bytesOut;
    if (!flags.dryRun) {
      console.log(`  ${r.srcRel} → +${r.written} written, ${r.skipped} skipped (${(r.bytesOut / 1024).toFixed(0)} KB)`);
    }
  }

  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log();
  console.log(`✓ Done in ${dt}s — wrote ${totalWritten}, skipped ${totalSkipped}, total ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((err) => {
  console.error("✗ generator failed:", err);
  process.exit(1);
});
