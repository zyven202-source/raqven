// Renders RAVQEN's symbol to the raster icon files the browser actually asks
// for: favicon.ico, icon-192.png and icon-512.png.
//
// There is no image library in this project and there is not going to be one —
// an icon generator is not worth a dependency, and adding a rasteriser to
// package.json is exactly the kind of thing that pushes a build past its
// deadline. The rasteriser itself is in `scripts/lib/mark-raster.mjs`, shared
// with `verify-mark.mjs` so the thing that measures the icon is the thing that
// drew it.
//
// What is left here is the part that is genuinely about icons:
//
//   1. Lighting. The gradients, the fold creases and the highlight hairlines are
//      the same ones the React mark draws, with their endpoints pushed through
//      the same transform, so the PNG and the app cannot drift apart.
//   2. Encoding. Node and Bun both ship zlib, and a PNG is a deflate stream
//      inside a chunk envelope; an ICO is a header in front of some PNGs.
//
// The geometry is imported from the app's own source. Run it after changing
// `src/components/brand/mark-geometry.ts`:
//
//   node scripts/generate-icons.mjs

import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  BRAND,
  CONTAINER,
  GLYPH,
  GLYPH_CENTRE,
  ICON_SCALE,
  SMALL_SCALE,
  VIEW_BOX,
} from "../src/components/brand/mark-geometry.ts";
import {
  coverage,
  flatten,
  makeGradient,
  mix,
  place,
  polylineDistance,
  rgb,
  squircleDistance,
  stop,
} from "./lib/mark-raster.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");

// ------------------------------------------------------------------ places

/**
 * Place a glyph-space point onto the tile.
 *
 * This is the same arithmetic as `markTransform()` in the geometry file, spelled
 * out so the generator can also apply the small-size zoom. The pivot is read
 * from `GLYPH_CENTRE` rather than written down, so nudging the paths moves the
 * icon and the app together.
 */
function place3(x, y) {
  return [12 + (x - GLYPH_CENTRE[0]) * ICON_SCALE, 12 + (y - GLYPH_CENTRE[1]) * ICON_SCALE];
}

/** The same point, then zoomed about the tile's centre — which crops the tile. */
function place3Zoomed(x, y, extra = 1) {
  const [x0, y0] = place3(x, y);
  return [12 + (x0 - 12) * extra, 12 + (y0 - 12) * extra];
}

// ------------------------------------------------------------------ render

/**
 * Renders one icon.
 *
 * `simple` drops the lighting entirely: a flat deep ground with a flat light
 * mark. That is the only treatment that survives 16 pixels.
 */
function render(size, { simple = false, extra = 1 } = {}) {
  const px = new Uint8Array(size * size * 4);
  /** Pixels per viewBox unit. */
  const unit = size / VIEW_BOX;
  /** The anti-aliasing threshold, in viewBox units: about one and a third pixels. */
  const aa = 1.35 / unit;

  const deep = rgb(BRAND.deep);
  const mint = rgb(BRAND.mint);
  const white = rgb(BRAND.white);

  // Fills are scanned in pixel space; gradients and creases are evaluated in
  // viewBox units. The two are one multiply apart, and getting it wrong fills
  // the tile with nothing at all.
  const fill = (d) =>
    place(flatten(d), (x, y) => {
      const [x0, y0] = place3Zoomed(x, y, extra);
      return [x0 * unit, y0 * unit];
    });
  const line = (d) => place(flatten(d), (x, y) => place3Zoomed(x, y, extra));

  // The three ribbons, in tile space, with their gradients and creases. Kept in
  // step with `MarkPaths.tsx`; the two describe the same material.
  const ribbons = simple
    ? []
    : [
        {
          polys: fill(GLYPH.bowl),
          gradient: makeGradient(
            [
              stop(0, BRAND.white),
              stop(0.26, BRAND.cream),
              stop(0.58, BRAND.mint),
              stop(1, "#5FBF9B"),
            ],
            place3(6, 4.3),
            place3(17.4, 12.4),
          ),
          crease: line("M13.7 7.3 C14.5 8.4 14.85 9.3 15 10.2 L18.6 13.1"),
          creaseShade: makeGradient(
            [stop(0, BRAND.deep, 0.62), stop(1, BRAND.deep, 0)],
            place3(14.4, 7.4),
            place3(18.3, 12.9),
          ),
          creaseWidth: 2.6,
          highlight: line("M6.4 4.75 C8.8 4.6 11.6 4.6 13.8 4.78 C15.5 5 16.6 5.8 17.3 6.9"),
          highlightWidth: 0.34,
          highlightAlpha: 0.72,
        },
        {
          polys: fill(GLYPH.stem),
          gradient: makeGradient(
            [stop(0, BRAND.cream), stop(0.38, BRAND.mint), stop(1, "#3E9C7B")],
            place3(10.9, 9.2),
            place3(6.1, 18.6),
          ),
          crease: line("M5.2 10.6 C5.2 14.2 5.5 16.6 6.3 18.1"),
          creaseShade: makeGradient(
            [stop(0, BRAND.deep, 0), stop(1, BRAND.deep, 0.6)],
            place3(5.8, 12),
            place3(6.4, 19),
          ),
          creaseWidth: 3,
          highlight: line("M6.1 8.85 C7.8 9.72 9.8 10.72 11.5 11.78"),
          highlightWidth: 0.32,
          highlightAlpha: 0.6,
        },
        {
          polys: fill(GLYPH.leg),
          gradient: makeGradient(
            [stop(0, "#4FAE8B"), stop(0.46, BRAND.mint), stop(1, BRAND.champagne)],
            place3(12.3, 12.1),
            place3(18.1, 20.5),
          ),
          crease: line("M12.4 12.9 C13.5 14.9 14.7 16.9 15.6 19.9"),
          creaseShade: makeGradient(
            [stop(0, BRAND.deep, 0.5), stop(1, BRAND.deep, 0)],
            place3(13.1, 14.4),
            place3(15.9, 20),
          ),
          creaseWidth: 2.8,
          highlight: line("M12.2 12.1 C14.1 13.8 16.2 16.3 17.9 19.1"),
          highlightWidth: 0.3,
          highlightAlpha: 0.55,
        },
      ];

  const markCov = ribbons.map((r) => coverage(r.polys, size));

  // The tile's own gradients, evaluated in tile space.
  const groundGrad = makeGradient(
    [stop(0, "#0E6B51"), stop(0.38, BRAND.ink), stop(0.78, BRAND.deep), stop(1, "#021A14")],
    [4, 2.4],
    [16.4, 22.8],
  );
  const glossGrad = makeGradient(
    [stop(0, BRAND.white, 0.26), stop(1, BRAND.white, 0)],
    [12, 0],
    [12, 13],
  );
  const rimGrad = makeGradient(
    [stop(0, BRAND.mint, 0.95), stop(0.45, BRAND.mint, 0.12), stop(1, BRAND.white, 0.22)],
    [2, 1.5],
    [21, 22],
  );

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Pixel centre in viewBox units.
      const vx = (x + 0.5) / unit;
      const vy = (y + 0.5) / unit;

      // The small-size zoom crops the tile about its own centre, so the
      // squircle is sampled at the un-zoomed point.
      const ux = 12 + (vx - 12) / extra;
      const uy = 12 + (vy - 12) / extra;

      const d = squircleDistance(ux - 12, uy - 12, CONTAINER.radius, CONTAINER.exponent);
      const tileAlpha = Math.max(0, Math.min(1, 0.5 - d / (2 * aa)));
      if (tileAlpha <= 0) continue;

      let colour;
      if (simple) {
        colour = deep.slice();
      } else {
        // The tile's ground, lit from the upper left.
        const g = groundGrad(ux, uy);
        colour = [g[0], g[1], g[2]];
        // The specular, where the light lands on the tile itself.
        const sheen = Math.max(0, 1 - Math.hypot(ux - 7.6, uy - 4.8) / 9);
        colour = colour.map((c, i) => mix(c, white[i], sheen * sheen * 0.3));
        const gloss = glossGrad(ux, uy);
        colour = colour.map((c, i) => mix(c, white[i], gloss[3] * 0.9));
        // The rim: a bright hairline along the lit edge, fading round the far side.
        const edge = Math.max(0, 1 - Math.abs(d) / (aa * 3.2));
        const rim = rimGrad(ux, uy);
        colour = colour.map((c, i) => mix(c, mint[i], edge * edge * 0.85 * rim[3]));
      }

      // The mark. Ribbons are drawn in order and the later one wins, matching
      // the DOM order in `MarkPaths.tsx`.
      let mark = null;
      let markAlpha = 0;
      for (let r = 0; r < ribbons.length; r += 1) {
        const a = markCov[r][y * size + x];
        if (a <= 0) continue;
        const ribbon = ribbons[r];
        if (simple) {
          mark = white;
          markAlpha = a;
          continue;
        }
        const g = ribbon.gradient(vx, vy);
        // The crease: a dark band just inside the shaded side of the fold.
        const cd = polylineDistance(vx, vy, ribbon.crease) / (aa * ribbon.creaseWidth * 2.4);
        const crease = ribbon.creaseShade(vx, vy)[3] * Math.max(0, 1 - cd * cd);
        // The highlight: a hairline along the lit edge.
        const hd = polylineDistance(vx, vy, ribbon.highlight) / (aa * ribbon.highlightWidth * 2.2);
        const light = ribbon.highlightAlpha * Math.max(0, 1 - hd * hd);
        mark = [
          mix(g[0] * (1 - crease * 0.75), white[0], light),
          mix(g[1] * (1 - crease * 0.75), white[1], light),
          mix(g[2] * (1 - crease * 0.75), white[2], light),
        ];
        markAlpha = a;
      }

      if (mark) colour = colour.map((c, i) => mix(c, mark[i], markAlpha));

      const at = (y * size + x) * 4;
      px[at] = Math.round(colour[0]);
      px[at + 1] = Math.round(colour[1]);
      px[at + 2] = Math.round(colour[2]);
      px[at + 3] = Math.round(tileAlpha * 255);
    }
  }

  return { size, data: px };
}

// ------------------------------------------------------------------- PNG

function crc32(buf) {
  let c;
  const table =
    crc32.table ??
    (crc32.table = (() => {
      const t = new Int32Array(256);
      for (let n = 0; n < 256; n += 1) {
        c = n;
        for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
      }
      return t;
    })());
  let crc = -1;
  for (let i = 0; i < buf.length; i += 1) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng({ size, data }) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    Buffer.from(data.buffer, data.byteOffset + y * size * 4, size * 4).copy(
      raw,
      y * (size * 4 + 1) + 1,
    );
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------- ICO

/**
 * An ICO holding PNG frames. Every browser that has ever asked for a favicon
 * since 2011 understands PNG-compressed icon entries, so this needs no BMP
 * encoder and no second rendering path.
 */
function encodeIco(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((image, i) => {
    const at = 6 + i * 16;
    header[at] = image.size >= 256 ? 0 : image.size;
    header[at + 1] = image.size >= 256 ? 0 : image.size;
    header[at + 2] = 0; // palette
    header[at + 3] = 0;
    header.writeUInt16LE(1, at + 4); // colour planes
    header.writeUInt16LE(32, at + 6); // bits per pixel
    header.writeUInt32LE(image.png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += image.png.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.png)]);
}

// ------------------------------------------------------------------ write

const written = [];

// Favicon: flat, slightly zoomed, because 16px is not a place for gradients.
const ico = encodeIco(
  [16, 32, 48].map((size) => ({
    size,
    png: encodePng(render(size, { simple: true, extra: SMALL_SCALE })),
  })),
);
writeFileSync(join(publicDir, "favicon.ico"), ico);
written.push("favicon.ico (16, 32, 48 — flat)");

for (const size of [192, 512]) {
  const name = `icon-${size}.png`;
  writeFileSync(join(publicDir, name), encodePng(render(size)));
  written.push(`${name} (full material)`);
}

console.log("Wrote:\n  " + written.join("\n  "));
