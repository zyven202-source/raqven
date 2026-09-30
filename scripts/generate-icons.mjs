#!/usr/bin/env node
// Render RAVQEN's raster icons from the brand SVG through headless Chromium.
//
// The R is typography, not paths, so the PNGs must be rasterized from real
// pixels with the real Fraunces letterform. Chromium is already in the
// workspace (the browser suites run on it), so the generator loads the same
// composition AppIcon.tsx draws, waits for Fraunces to arrive from Google
// Fonts, and screenshots the SVG node with Playwright -- which returns a PNG
// buffer directly, so there is no image code here at all beyond the ICO
// wrapper.
//
// Run after changing src/components/brand/AppIcon.tsx:
//
//   cd /home/daytona/codebase && node scripts/generate-icons.mjs
//
// Playwright resolves from /tmp/pwtest's node_modules.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const { chromium } = await import(
  process.env.PLAYWRIGHT_PATH || "/tmp/pwtest/node_modules/playwright/index.mjs"
);

// The same numbers the React AppIcon renders. The .ts extension is required
// for Node's type stripping, and is how the previous generator did it too.
const { BRAND, CONTAINER, R_GLYPH, VIEW_BOX } =
  await import("../src/components/brand/mark-geometry.ts");

// The same composition AppIcon.tsx draws, composed from the same data.
function artSvg(size) {
  const rect = `x="0" y="0" width="${VIEW_BOX}" height="${VIEW_BOX}" rx="${CONTAINER.cornerRadius}"`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_BOX} ${VIEW_BOX}" width="${size}" height="${size}">`,
    "<defs>",
    '<radialGradient id="shell" cx="0.33" cy="0.2" r="1.05">',
    `<stop offset="0%" stop-color="${BRAND.glow}"/>`,
    `<stop offset="38%" stop-color="${BRAND.ink}"/>`,
    `<stop offset="78%" stop-color="${BRAND.deep}"/>`,
    `<stop offset="100%" stop-color="${BRAND.night}"/>`,
    "</radialGradient>",
    '<linearGradient id="gloss" x1="12" y1="0" x2="12" y2="13">',
    `<stop offset="0%" stop-color="${BRAND.white}" stop-opacity="0.26"/>`,
    `<stop offset="100%" stop-color="${BRAND.white}" stop-opacity="0"/>`,
    "</linearGradient>",
    '<linearGradient id="rim" x1="2" y1="1.5" x2="21" y2="22">',
    `<stop offset="0%" stop-color="${BRAND.mint}" stop-opacity="0.95"/>`,
    `<stop offset="45%" stop-color="${BRAND.mint}" stop-opacity="0.12"/>`,
    `<stop offset="100%" stop-color="${BRAND.white}" stop-opacity="0.22"/>`,
    "</linearGradient>",
    "</defs>",
    `<rect ${rect} fill="url(#shell)"/>`,
    `<rect ${rect} fill="url(#gloss)"/>`,
    `<rect ${rect} fill="none" stroke="url(#rim)" stroke-width="0.55"/>`,
    `<text x="${R_GLYPH.baseline[0]}" y="${R_GLYPH.baseline[1]}" text-anchor="middle" font-family="${R_GLYPH.family}" font-size="${R_GLYPH.size}" font-weight="600" fill="${BRAND.letter}">R</text>`,
    "</svg>",
  ].join("");
}

// A favicon.ico wrapping PNG frames (the format browsers accept).
function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  const frames = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, png } of pngs) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bpp
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
    frames.push(png);
  }
  return Buffer.concat([header, ...entries, ...frames]);
}

const outDir = join(process.cwd(), "public");
const sizes = [16, 32, 48, 192, 512];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();

// One page holds one SVG per size, stacked; fonts load once for all of them.
const body = sizes.map((s) => artSvg(s)).join("");
await page.setContent(
  "<!doctype html><html><head>" +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&display=block">' +
    "<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>" +
    "</head><body>" +
    body +
    "</body></html>",
  { waitUntil: "networkidle" },
);

// Fraunces must actually be loaded before the R is drawn, or the raster falls
// back to Georgia and the icons ship with the wrong letterform.
await page.evaluate(() =>
  document.fonts.load('600 20px "Fraunces"', "R").then(() => document.fonts.ready),
);
const loaded = await page.evaluate(() => document.fonts.check('600 20px "Fraunces"'));
if (!loaded) {
  console.error("Fraunces did not load; refusing to write icons with a fallback letterform.");
  await browser.close();
  process.exit(1);
}

const svgs = page.locator("svg");
const pngs = new Map();
for (let i = 0; i < sizes.length; i += 1) {
  const png = await svgs.nth(i).screenshot({ omitBackground: true });
  pngs.set(sizes[i], png);
}
await browser.close();

writeFileSync(join(outDir, "icon-512.png"), pngs.get(512));
writeFileSync(join(outDir, "icon-192.png"), pngs.get(192));
writeFileSync(
  join(outDir, "favicon.ico"),
  encodeIco([
    { size: 16, png: pngs.get(16) },
    { size: 32, png: pngs.get(32) },
    { size: 48, png: pngs.get(48) },
  ]),
);
console.log("icons written: favicon.ico (16/32/48), icon-192.png, icon-512.png");
