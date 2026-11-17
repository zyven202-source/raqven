#!/usr/bin/env bun
/**
 * Encodes the photography placed around SAVO into the widths the layouts use.
 *
 * The originals are Unsplash photographs downloaded at 2400px into
 * `public/photography/<slug>.jpg`. The source URL and credit for each one live
 * in `public/photography/manifest.json` and `src/lib/photography.ts`. This
 * script rewrites each original as a 1600px JPEG fallback and adds WebP at
 * 900px and 1600px. AVIF is reserved for the hero, where the extra seconds of
 * encoding buy the most bytes. Nothing here crops — focal positioning is CSS — so
 * the composition is exactly the one inspected on Unsplash.
 *
 * Run after replacing any original:  bun scripts/optimize-photography.mjs
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const dir = path.join(process.cwd(), "public", "photography");
const originals = (await readdir(dir)).filter(
  (file) => file.endsWith(".jpg") && !/-\d{3,4}\.jpg$/.test(file),
);

let before = 0;
let after = 0;

for (const file of originals.sort()) {
  const slug = path.parse(file).name;
  const input = path.join(dir, file);
  const meta = await sharp(input).metadata();
  before += (await stat(input)).size;

  const fallback = await sharp(input)
    .resize({ width: 1600, withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
  await Bun.write(input, fallback);
  after += fallback.byteLength;

  for (const width of [900, 1600]) {
    if (width > meta.width) continue;
    const base = () => sharp(input).resize({ width, withoutEnlargement: true });
    const webp = path.join(dir, `${slug}-${width}.webp`);
    await base().webp({ quality: 76, effort: 4 }).toFile(webp);
    after += (await stat(webp)).size;
  }

  console.log(`${slug.padEnd(12)} ${meta.width}×${meta.height} encoded`);
}

console.log(`\nserved bytes: ${(after / 1024).toFixed(0)} KB (was ${(before / 1024).toFixed(0)} KB)`);
