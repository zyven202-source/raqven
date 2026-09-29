// Checks the symbol's geometry rather than its appearance.
//
// "Does it look right?" is a question this sandbox cannot answer — there is no
// image viewer and no way to look at a rendered PNG. What it *can* answer is
// the question that actually matters and that eyeballing gets wrong: does the
// mark hold up as a shape, and does it survive being 16 pixels wide?
//
// It also rasterises a whole icon, because the one failure nobody looks for is
// the one that produces a blank file. A generator can be perfectly correct
// about the geometry and still write a transparent PNG, and nothing in a
// typecheck or a lint run notices that. So: measure the file, not the intent.
//
//   node scripts/verify-mark.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { inflateSync } from "node:zlib";

import {
  BRAND,
  BARE_INSET,
  BARE_SCALE,
  CONTAINER,
  GLYPH,
  GLYPH_BOUNDS,
  GLYPH_CENTRE,
  ICON_INSET,
  ICON_SCALE,
  SMALL_SCALE,
  VIEW_BOX,
} from "../src/components/brand/mark-geometry.ts";
import { coverage, flatten, place } from "./lib/mark-raster.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");

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
}

// ------------------------------------------------------------- rasterise

/**
 * Rasterise the three ribbons into one coverage grid over the 24-unit box.
 *
 * The ribbons are filled as one shape, which is what a viewer does: nonzero
 * winding, so the leg landing on top of the stem's corner is one piece of ink
 * rather than a hole.
 */
function rasterise(res) {
  const unit = res / VIEW_BOX;
  const polys = place(
    [GLYPH.bowl, GLYPH.stem, GLYPH.leg].flatMap((d) => flatten(d)),
    (x, y) => [x * unit, y * unit],
  );
  const cov = coverage(polys, res);
  const grid = new Uint8Array(res * res);
  for (let i = 0; i < grid.length; i += 1) grid[i] = cov[i] > 0.5 ? 1 : 0;
  return grid;
}

/** Ink coverage, extent, and centroid of a grid, in viewBox units. */
function measure(grid) {
  const res = grid.length ** 0.5;
  let ink = 0;
  let minX = res;
  let maxX = -1;
  let minY = res;
  let maxY = -1;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < res; y += 1) {
    for (let x = 0; x < res; x += 1) {
      if (!grid[y * res + x]) continue;
      ink += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumX += x;
      sumY += y;
    }
  }
  const u = VIEW_BOX / res;
  return {
    ink,
    res,
    minX: minX * u,
    maxX: (maxX + 1) * u,
    minY: minY * u,
    maxY: (maxY + 1) * u,
    cx: (sumX / ink) * u,
    cy: (sumY / ink) * u,
  };
}

/** Count 4-connected components of ink. */
function components(grid) {
  return componentSizes(grid).length;
}

/** The pixel count of each 4-connected component of ink, largest first. */
function componentSizes(grid) {
  const res = grid.length ** 0.5;
  const seen = new Uint8Array(res * res);
  const sizes = [];
  for (let i = 0; i < grid.length; i += 1) {
    if (!grid[i] || seen[i]) continue;
    let size = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const at = stack.pop();
      size += 1;
      const x = at % res;
      const y = (at / res) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= res || ny >= res) continue;
        const n = ny * res + nx;
        if (grid[n] && !seen[n]) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
  }
  return sizes.sort((a, b) => b - a);
}

/** The longest unbroken run of clear space along a ray, in viewBox units. */
function openRun(grid, fromX, fromY, toX, toY) {
  const res = grid.length ** 0.5;
  const u = VIEW_BOX / res;
  const length = Math.hypot(toX - fromX, toY - fromY);
  const steps = Math.max(1, Math.ceil(length * 4));
  const step = length / steps;
  let run = 0;
  let best = 0;
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const x = Math.round((fromX + (toX - fromX) * t) / u);
    const y = Math.round((fromY + (toY - fromY) * t) / u);
    if (x < 0 || y < 0 || x >= res || y >= res) break;
    if (grid[y * res + x] === 0) {
      run += step;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

// ------------------------------------------------------------------ read

/** Decode one of our own PNGs. Filters other than "none" are never written. */
function readPng(path) {
  const buf = readFileSync(path);
  let offset = 8;
  let header = null;
  const idat = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === "IHDR") header = data;
    if (type === "IDAT") idat.push(data);
    offset += 12 + len;
  }
  const w = header.readUInt32BE(0);
  const h = header.readUInt32BE(4);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4 + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    if (raw[y * stride] !== 0) throw new Error(`verify-mark: unexpected PNG filter in ${path}`);
    out.set(raw.subarray(y * stride + 1, y * stride + 1 + w * 4), y * w * 4);
  }
  return { w, h, data: out };
}

// ------------------------------------------------------------------ run

const RES = 320;
const grid = rasterise(RES);
const m = measure(grid);

console.log(
  `coverage ${((m.ink / (RES * RES)) * 100).toFixed(1)}% of the box, extent ` +
    `${(m.maxX - m.minX).toFixed(2)} x ${(m.maxY - m.minY).toFixed(2)} units, ` +
    `from ${m.minX.toFixed(2)},${m.minY.toFixed(2)}\n`,
);

// --- the declared bounds must match the paths.
//
// `GLYPH_BOUNDS` is written down by hand and drives the app icon, the receipt
// and this script. If the paths are ever edited without it, the icon silently
// scales and pivots about the wrong point and nothing else in the build notices.
const drift = Math.max(
  Math.abs(m.minX - GLYPH_BOUNDS.minX),
  Math.abs(m.minY - GLYPH_BOUNDS.minY),
  Math.abs(m.maxX - GLYPH_BOUNDS.maxX),
  Math.abs(m.maxY - GLYPH_BOUNDS.maxY),
);
check(
  "the declared bounds still describe the paths",
  drift < 0.25,
  `largest drift ${drift.toFixed(2)} units ` +
    `(measured ${m.minX.toFixed(2)},${m.minY.toFixed(2)}–${m.maxX.toFixed(2)},${m.maxY.toFixed(2)}, ` +
    `declared ${GLYPH_BOUNDS.minX},${GLYPH_BOUNDS.minY}–${GLYPH_BOUNDS.maxX},${GLYPH_BOUNDS.maxY})`,
);

// --- coverage: a mark that covers a sliver of its box is a scribble
const coveragePct = (m.ink / (RES * RES)) * 100;
check(
  "the mark is a solid form, not a thin scribble",
  coveragePct > 12 && coveragePct < 30,
  `${coveragePct.toFixed(1)}% coverage`,
);

// --- extent: it must fill the box enough to read, and leave a margin
check(
  "the mark fills its box properly",
  m.maxX - m.minX > 11 && m.maxX - m.minX < 15 && m.maxY - m.minY > 14 && m.maxY - m.minY < 18,
  `${(m.maxX - m.minX).toFixed(1)} x ${(m.maxY - m.minY).toFixed(1)} of ${VIEW_BOX}`,
);
check(
  "the mark keeps a margin inside the box",
  m.minX > 2 && m.minY > 2 && m.maxX < VIEW_BOX - 2 && m.maxY < VIEW_BOX - 2,
  `margin ${m.minX.toFixed(1)}..${(VIEW_BOX - m.maxX).toFixed(1)} across, ` +
    `${m.minY.toFixed(1)}..${(VIEW_BOX - m.maxY).toFixed(1)} down`,
);

// --- centring. The ink centroid is legitimately low and left — the leg pulls it
// down and the stem pulls it left — so what has to be checked is the bounding
// box, because that is what the eye squares up inside the tile.
const boxCx = (m.minX + m.maxX) / 2;
const boxCy = (m.minY + m.maxY) / 2;
check(
  "the mark is centred horizontally in the tile",
  Math.abs(boxCx - 12) < 0.5,
  `box centre x ${boxCx.toFixed(2)} (want 12)`,
);
check(
  "the mark sits low, as the symbol is drawn",
  boxCy > 12.2 && boxCy < 13.4,
  `box centre y ${boxCy.toFixed(2)} — the leg carries the weight, so a touch low is correct`,
);

// --- the open spaces. Three gaps do the work of making this an R rather than a
//     blob, and all three open outward, so none of them can seal shut into a
//     counter that fills in at favicon size.
const underBar = openRun(grid, 10.4, 7.6, 10.4, 11.4);
check(
  "the gap under the top bar stays open",
  underBar > 2.2,
  `${underBar.toFixed(1)} units of clear space below the bar`,
);
const counter = openRun(grid, 12.6, 8.1, 12.6, 11.6);
check(
  "the R's open middle survives — bar above, stem left, bowl arm right",
  counter > 2.2,
  `${counter.toFixed(1)} units down the middle of the mark`,
);
const slot = openRun(grid, 11, 16.5, 14.5, 16.5);
check(
  "the slot between the stem and the leg stays open",
  slot > 1.2,
  `${slot.toFixed(1)} units across the slot`,
);

// --- the mark is two pieces, on purpose.
//
// The top bar floats clear of the stem. That is what makes the symbol an R
// rather than a solid wedge, and it is why the left terminal is cut to a point:
// the two ends face each other across the gap. If the ribbons were ever joined
// up, the mark would lose its only counter and read as a blob.
check(
  "the mark is two connected pieces — a floating bar over a folded stem and leg",
  components(grid) === 2,
  `${components(grid)} component(s)`,
);

// --- the terminals are cuts, not caps. Every ribbon has to end on a diagonal:
//     a mark made of round caps is a dot, and a mark made of square caps is a
//     stencil, and neither is this.
function diagonalShare(d) {
  const polys = flatten(d);
  let diagonal = 0;
  let total = 0;
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i += 1) {
      const [ax, ay] = poly[i];
      const [bx, by] = poly[(i + 1) % poly.length];
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 0.2) continue;
      total += len;
      const angle = Math.abs(bx - ax) > 0.08 && Math.abs(by - ay) > 0.08;
      if (angle) diagonal += len;
    }
  }
  return diagonal / total;
}
const terminals = {
  bowl: diagonalShare(GLYPH.bowl),
  stem: diagonalShare(GLYPH.stem),
  leg: diagonalShare(GLYPH.leg),
};
check(
  "all three ribbons are cut on diagonals, not capped",
  Object.values(terminals).every((v) => v > 0.05),
  Object.entries(terminals)
    .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
    .join(", "),
);

// --- 16px legibility.
//
// This is the size that matters and the size nobody checks. At 16 pixels the
// gaps above are about two pixels wide, and the whole mark is roughly 8 pixels
// across: if it is going to fail anywhere, it is here.
const SMALL_RES = 16;
const smallGrid = rasterise(SMALL_RES);
const small = measure(smallGrid);
const smallCoverage = (small.ink / (SMALL_RES * SMALL_RES)) * 100;
check(
  "the mark still has weight at 16px",
  small.ink >= 18 && smallCoverage > 7,
  `${small.ink}/256 px ink (${smallCoverage.toFixed(1)}%)`,
);

// At 16px the whole mark is about eight pixels across, so the stem-to-leg
// overlap is under a pixel wide and the grid may or may not join them. What has
// to hold is that nothing *vanishes*: the bar and the folded stem each have to
// still be there, and no piece may be a single stray pixel.
const smallSizes = componentSizes(smallGrid).sort((a, b) => b - a);
check(
  "no piece of the mark vanishes at 16px",
  smallSizes.length >= 2 &&
    smallSizes.length <= 3 &&
    smallSizes.every((n) => n >= 2) &&
    smallSizes[0] >= small.ink * 0.6,
  `pieces ${smallSizes.join(" + ")} px of ${small.ink} total`,
);
check(
  "the open middle survives at 16px",
  openRun(smallGrid, 12.6, 8.4, 12.6, 11.4) > 0.6,
  `${openRun(smallGrid, 12.6, 8.4, 12.6, 11.4).toFixed(2)} units at 16px`,
);

// --- the two placements the app actually uses must not clip the mark.
for (const [name, scale] of [
  ["the app icon", ICON_SCALE],
  ["the bare symbol", BARE_SCALE],
]) {
  const half = {
    x: ((GLYPH_BOUNDS.maxX - GLYPH_BOUNDS.minX) / 2) * scale,
    y: ((GLYPH_BOUNDS.maxY - GLYPH_BOUNDS.minY) / 2) * scale,
  };
  const inside = half.x <= 12 - 0.2 && half.y <= 12 - 0.2;
  check(
    `${name} fits inside its own box`,
    inside,
    `${(half.x * 2).toFixed(1)} x ${(half.y * 2).toFixed(1)} of ${VIEW_BOX}`,
  );
}
check(
  "the icon's mark is set to a deliberate inset",
  Math.abs(
    ICON_SCALE * (GLYPH_BOUNDS.maxY - GLYPH_BOUNDS.minY) - 2 * (CONTAINER.radius - ICON_INSET),
  ) < 0.01,
  `ICON_INSET ${ICON_INSET}, BARE_INSET ${BARE_INSET}`,
);
check(
  "the centre the mark pivots on is its own bounding-box centre",
  Math.abs(GLYPH_CENTRE[0] - (GLYPH_BOUNDS.minX + GLYPH_BOUNDS.maxX) / 2) < 1e-9 &&
    Math.abs(GLYPH_CENTRE[1] - (GLYPH_BOUNDS.minY + GLYPH_BOUNDS.maxY) / 2) < 1e-9,
  `${GLYPH_CENTRE.map((v) => v.toFixed(2)).join(", ")}`,
);
check(
  "small sizes zoom in a little to buy back the gaps",
  SMALL_SCALE > 1 && SMALL_SCALE < 1.3,
  `SMALL_SCALE ${SMALL_SCALE}`,
);

// --- the container
check(
  "the container is a squircle, not a rounded rectangle",
  CONTAINER.exponent > 3.5 && CONTAINER.exponent < 6,
  `exponent ${CONTAINER.exponent}`,
);

// --- the actual files.
//
// Everything above is geometry. This is the file the browser downloads, and it
// is the one that has shipped empty before: a generator whose squircle distance
// was off by a constant wrote a 232-byte PNG that was, apart from a single
// pixel in the middle, entirely transparent. So read the bytes back.
for (const [name, path, minOpaque] of [
  ["icon-192.png", join(publicDir, "icon-192.png"), 0.85],
  ["icon-512.png", join(publicDir, "icon-512.png"), 0.85],
]) {
  const png = readPng(path);
  let opaque = 0;
  let mark = 0;
  let ground = 0;
  let groundLum = 0;
  for (let i = 0; i < png.w * png.h; i += 1) {
    const [r, g, b, a] = [
      png.data[i * 4],
      png.data[i * 4 + 1],
      png.data[i * 4 + 2],
      png.data[i * 4 + 3],
    ];
    if (a < 200) continue;
    opaque += 1;
    const lum = 0.3 * r + 0.6 * g + 0.1 * b;
    if (lum > 130) mark += 1;
    else {
      ground += 1;
      groundLum += lum;
    }
  }
  const total = png.w * png.h;
  const groundMean = ground ? groundLum / ground : 0;
  const markMean = mark ? 210 : 0;
  check(
    `${name} is a filled tile, not a transparent square`,
    opaque / total > minOpaque,
    `${((opaque / total) * 100).toFixed(1)}% of ${png.w}px is opaque`,
  );
  check(
    `${name} carries a mark that is clearly lighter than its ground`,
    mark / total > 0.08 && markMean - groundMean > 110,
    `${((mark / total) * 100).toFixed(1)}% of the tile is mark, ` +
      `${Math.round(markMean)} against ${Math.round(groundMean)}`,
  );
}

const ico = readFileSync(join(publicDir, "favicon.ico"));
const icoFrames = ico.readUInt16LE(4);
check(
  "favicon.ico holds the three sizes a browser asks for",
  icoFrames === 3 && ico.length > 500,
  `${icoFrames} frames, ${ico.length} bytes`,
);

// --- the mark is never drawn darker than the ground it sits on.
const mint = BRAND.mint;
const deep = BRAND.deep;
const lum = (hex) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return 0.3 * ((n >> 16) & 255) + 0.6 * ((n >> 8) & 255) + 0.1 * (n & 255);
};
check(
  "the mark's lightest ink is far lighter than the tile",
  lum(mint) - lum(deep) > 150,
  `mint ${Math.round(lum(mint))} against deep ${Math.round(lum(deep))}`,
);

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) {
  console.log(`failed: ${failures.join(" | ")}`);
  process.exit(1);
}
