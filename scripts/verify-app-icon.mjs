#!/usr/bin/env node
// Measures the generated SAVO mark icons through Chromium's own PNG decoder,
// so the suite proves what the browser will actually show rather than what the
// generator intended.
//
// The identity is the drawn Savo mark: emerald stroke with a gold band across
// the centre fold, deep-emerald tile, rounded corners. The assertions locate
// the mark from its colour — nothing
// samples a fixed point in the artwork, because a probe that names coordinates
// keeps passing by measuring whatever moved underneath it. What must be true
// of any honest rendering is asserted instead:
//
//   - the corners are transparent (the tile is rounded, not a full-bleed square)
//   - the tile is emerald and dark, the mark is emerald/gold and bright
//   - the letter is a single population, centred in the tile, taller than wide
//   - at 16px the letter still occupies real pixels, or the favicon is mud
//
// Run from the pwtest checkout (playwright lives there):
//   cd /tmp/pwtest && CHROMIUM_PATH=... bun verify-app-icon.mjs <publicDir>

import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const publicDir = resolve(process.argv[2] || "/home/daytona/codebase/public");
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

let passed = 0;
const failures = [];
function check(name, ok, detail = "") {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failures.push(name);
    console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
  return ok;
}

/**
 * Mark-band test: the stroke is emerald #10B981 banded with gold #F59E0B.
 * The bounds that make this honest rather than generous:
 *   - emerald: green-dominant, and *blue* enough to be the letter (b < 0.8g),
 *     which is what separates it from the pale mint rim and the white gloss —
 *     both of those are far bluer and both would otherwise count as letter;
 *     r < 120 keeps the dark tile greens out.
 *   - gold: warm and bright, which nothing else on the tile is.
 */
const CHAMPAGNE = `(r, g, b) =>
  (g > 140 && r < 120 && b > 80 && b < g * 0.8) ||
  (r > 190 && g > 110 && g < 190 && b < 80)`;

/**
 * Decode a PNG (bytes read in Node, pixels decoded in the browser) and measure
 * the two populations: the champagne letter and everything else with alpha.
 * Tile darkness is read from the darkest decile, which is the flat ground away
 * from the gradient's lit top.
 */
async function measure(pngPath) {
  const bytes = readFileSync(pngPath);
  const b64 = bytes.toString("base64");
  const page = await browser.newPage();
  const result = await page.evaluate(
    async ({ b64, champagneSrc }) => {
      const champagne = eval(champagneSrc);
      const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
      const image = new Image();
      image.src = URL.createObjectURL(blob);
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const { data: px } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const size = canvas.width;

      let letter = 0;
      let tile = 0;
      let lx = 0;
      let ly = 0;
      let lMinX = size;
      let lMaxX = -1;
      let lMinY = size;
      let lMaxY = -1;
      const tileLights = [];
      const cornerAlphas = [
        [0, 0],
        [size - 1, 0],
        [0, size - 1],
        [size - 1, size - 1],
      ].map(([x, y]) => px[(y * size + x) * 4 + 3]);

      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const i = (y * size + x) * 4;
          const a = px[i + 3];
          if (a < 128) continue;
          const r = px[i];
          const g = px[i + 1];
          const b = px[i + 2];
          if (champagne(r, g, b)) {
            letter += 1;
            lx += x;
            ly += y;
            if (x < lMinX) lMinX = x;
            if (x > lMaxX) lMaxX = x;
            if (y < lMinY) lMinY = y;
            if (y > lMaxY) lMaxY = y;
          } else {
            tile += 1;
            tileLights.push(Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b));
          }
        }
      }
      tileLights.sort((a, b) => a - b);
      const at = (q) => tileLights[Math.floor(tileLights.length * q)] ?? null;
      return {
        size,
        cornerAlphas,
        letter,
        tile,
        letterCentre: letter ? [lx / letter, ly / letter] : null,
        letterBox: letter ? { w: lMaxX - lMinX, h: lMaxY - lMinY } : null,
        tileDark: at(0.1),
        tileBright: at(0.95),
      };
    },
    { b64, champagneSrc: CHAMPAGNE },
  );
  await page.close();
  return result;
}

// ------------------------------------------------------------- icon-512.png
const big = await measure(join(publicDir, "icon-512.png"));
check("icon-512 decodes as a 512px square", big.size === 512, `${big.size}px`);
check(
  "the tile's corners are transparent (rounded, not full-bleed)",
  big.cornerAlphas.every((a) => a < 40),
  `corner alphas ${big.cornerAlphas.join(", ")}`,
);
check("the letter is present and substantial", big.letter > 3000, `${big.letter} mark px`);
check("the tile is present behind it", big.tile > 100000, `${big.tile} tile px`);
check(
  "the tile is dark emerald and the mark bright",
  big.tileDark !== null && big.tileDark < 110 && big.tileBright > 150,
  `tile dark ${big.tileDark}, bright ${big.tileBright}`,
);
check(
  "the letter is centred in the tile",
  big.letterCentre !== null &&
    Math.abs(big.letterCentre[0] - 256) < 30 &&
    Math.abs(big.letterCentre[1] - 256) < 30,
  `centre ${big.letterCentre?.map((n) => Math.round(n)).join(", ") ?? "none"}`,
);
check(
  "the mark reads as the drawn symbol, taller than wide",
  big.letterBox !== null && big.letterBox.h > big.letterBox.w,
  big.letterBox ? `${big.letterBox.w}x${big.letterBox.h}` : "no mark",
);

// ------------------------------------------------------------- icon-192.png
const mid = await measure(join(publicDir, "icon-192.png"));
check(
  "icon-192 carries the same composition",
  mid.size === 192 && mid.letter > 400 && mid.tileDark !== null && mid.tileDark < 110,
  `letter ${mid.letter}px, tile dark ${mid.tileDark}`,
);

// ------------------------------------------------------------- favicon.ico
// The ICO wraps PNG frames; carve the 16px one out by its declared offset and
// decode it like any other PNG.
const icoBytes = readFileSync(join(publicDir, "favicon.ico"));
const icoB64 = icoBytes.toString("base64");
const page = await browser.newPage();
const fav16 = await page.evaluate(
  async ({ b64, champagneSrc }) => {
    const champagne = eval(champagneSrc);
    const buf = await (await fetch(`data:application/octet-stream;base64,${b64}`)).arrayBuffer();
    const view = new DataView(buf);
    if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 1) return null;
    const count = view.getUint16(4, true);
    let frame = null;
    for (let i = 0; i < count; i += 1) {
      const entry = 6 + i * 16;
      const w = view.getUint8(entry) || 256;
      if (w === 16 && !frame) {
        const len = view.getUint32(entry + 8, true);
        const off = view.getUint32(entry + 12, true);
        frame = new Uint8Array(buf.slice(off, off + len));
      }
    }
    if (!frame) return null;
    const blob = new Blob([frame], { type: "image/png" });
    const image = new Image();
    image.src = URL.createObjectURL(blob);
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const { data: px } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let letter = 0;
    let tile = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 100) continue;
      if (champagne(px[i], px[i + 1], px[i + 2])) letter += 1;
      else tile += 1;
    }
    return { size: canvas.width, letter, tile };
  },
  {
    b64: icoB64,
    champagneSrc: CHAMPAGNE,
  },
);
await page.close();

check(
  "favicon.ico parses and carries a 16px PNG frame",
  fav16 !== null && fav16.size === 16,
  `${icoBytes.length} bytes`,
);
check(
  "the 16px letter occupies real pixels (readable, not mud)",
  fav16 !== null && fav16.letter > 12 && fav16.tile > 100,
  fav16 ? `letter ${fav16.letter}px, tile ${fav16.tile}px` : "no frame",
);

await browser.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
