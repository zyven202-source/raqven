#!/usr/bin/env node
// Render Pith's raster icons from the brand geometry.
//
// The mark is a stroked path, not typography, so there is no font to wait for:
// this composes the same SVG that `AppIcon.tsx` draws, from the same numbers in
// `mark-geometry.ts`, and rasterises it with resvg — a Rust SVG renderer with a
// prebuilt binary, so there is no browser download and no system library to
// install. Re-run it after changing the geometry or the palette:
//
//   bun scripts/generate-icons.mjs
//
// Outputs, all in `public/`:
//   favicon.ico                16, 32 and 48 px, flat (no gloss — it is mud at 16)
//   icon-192.png               192 px, full material (home screen)
//   icon-512.png               512 px, full material (store listing, maskable)
//   apple-touch-icon.png       180 px, full material on an opaque ground
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { Resvg } from "@resvg/resvg-js";

const { BRAND, CONTAINER, MARK, MARK_PAINT, VIEW_BOX } =
  await import("../src/components/brand/mark-geometry.ts");

const OUT = join(import.meta.dirname, "..", "public");

/** The tile plus the monogram, at one detail level. */
function artSvg({ detail = true, opaque = false } = {}) {
  const rect = `x="0" y="0" width="${VIEW_BOX}" height="${VIEW_BOX}" rx="${CONTAINER.cornerRadius}"`;
  const shell = detail
    ? [
        '<radialGradient id="shell" cx="0.33" cy="0.2" r="1.05">',
        `<stop offset="0%" stop-color="${BRAND.glow}"/>`,
        `<stop offset="42%" stop-color="${BRAND.ink}"/>`,
        `<stop offset="82%" stop-color="${BRAND.deep}"/>`,
        `<stop offset="100%" stop-color="${BRAND.night}"/>`,
        "</radialGradient>",
      ].join("")
    : "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_BOX} ${VIEW_BOX}">`,
    "<defs>",
    shell,
    '<linearGradient id="letter" x1="' +
      MARK_PAINT.x1 +
      '" y1="' +
      MARK_PAINT.y1 +
      '" x2="' +
      MARK_PAINT.x2 +
      '" y2="' +
      MARK_PAINT.y2 +
      '">',
    ...MARK_PAINT.stops.map((s) => `<stop offset="${s.offset}" stop-color="${s.color}"/>`),
    "</linearGradient>",
    "</defs>",
    // An opaque cream ground, for platforms that paste the icon onto their own
    // surface (iOS masks the corners; Android masks the whole shape).
    opaque ? `<rect x="0" y="0" width="${VIEW_BOX}" height="${VIEW_BOX}" fill="${BRAND.cream}"/>` : "",
    `<rect ${rect} fill="${detail ? "url(#shell)" : BRAND.deep}"/>`,
    detail
      ? `<rect ${rect} fill="none" stroke="${BRAND.white}" stroke-opacity="0.14" stroke-width="0.55"/>`
      : "",
    `<path d="${MARK.path}" fill="none" stroke="${
      detail ? "url(#letter)" : BRAND.mint
    }" stroke-width="${MARK.stroke}" stroke-linecap="${MARK.linecap}"/>`,
    "</svg>",
  ].join("");
}

function renderPng(size, options) {
  const svg = artSvg(options);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: size },
    background: "rgba(0,0,0,0)",
  });
  return Buffer.from(resvg.render().asPng());
}

/** A favicon.ico wrapping PNG frames — the format every current browser accepts. */
function encodeIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4); // count
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

const frames = [16, 32, 48].map((size) => ({ size, png: renderPng(size, { detail: false }) }));
writeFileSync(join(OUT, "favicon.ico"), encodeIco(frames));

const icons = [
  { file: "icon-192.png", size: 192, options: { detail: true } },
  { file: "icon-512.png", size: 512, options: { detail: true } },
  { file: "apple-touch-icon.png", size: 180, options: { detail: true, opaque: true } },
];
for (const { file, size, options } of icons) {
  writeFileSync(join(OUT, file), renderPng(size, options));
}

console.log(
  `Pith icons written: favicon.ico (${frames.length} frames), ` +
    icons.map((i) => `${i.file} @${i.size}`).join(", "),
);
