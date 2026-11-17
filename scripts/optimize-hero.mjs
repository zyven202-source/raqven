#!/usr/bin/env bun
/**
 * Rebuilds the responsive hero derivatives from the two originals.
 *
 * The originals (`shop-wide.jpg`, `shop-tall.jpg`) are the crops that were
 * chosen by eye; this script never changes the framing, only the encoding. It
 * writes AVIF and WebP at the widths the hero actually uses, so a phone does not
 * download a 2000px desktop crop and a modern browser does not download a JPEG
 * when it could have had a third of the bytes.
 *
 * Run it after replacing either original:  bun scripts/optimize-hero.mjs
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const HERO_DIR = path.join(process.cwd(), "public", "hero");

const SOURCES = [
  // file, widths
  { file: "shop-wide.jpg", widths: [1200, 1600, 2000] },
  { file: "shop-tall.jpg", widths: [700, 900, 1100] },
];

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

for (const source of SOURCES) {
  const inputPath = path.join(HERO_DIR, source.file);
  const image = sharp(inputPath);
  const meta = await image.metadata();
  console.log(`\n${source.file} — ${meta.width}×${meta.height}`);

  for (const width of source.widths) {
    for (const format of ["avif", "webp"]) {
      const out = path.join(HERO_DIR, `${path.parse(source.file).name}-${width}.${format}`);
      const pipeline = sharp(inputPath).resize({ width, withoutEnlargement: true });
      if (format === "avif") {
        await pipeline.avif({ quality: 50, effort: 6 }).toFile(out);
      } else {
        await pipeline.webp({ quality: 74, effort: 6 }).toFile(out);
      }
      console.log(`  ${path.basename(out).padEnd(26)} ${kb((await stat(out)).size)}`);
    }
  }
}

console.log("\nDerivatives written to public/hero/");
const files = await readdir(HERO_DIR);
console.log(`Files now present: ${files.sort().join(", ")}`);
