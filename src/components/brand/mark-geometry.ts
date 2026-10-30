/**
 * SAVO's brand data, in one place.
 *
 * The identity is a drawn symbol — the Savo mark: one continuous stroke that
 * sweeps over the top bowl, through the centre and round the lower bowl. Two
 * tangent arcs, one line, no letterform and no icon library: a shape that is
 * recognisable at 16 pixels, prints on a thermal receipt in one ink, and works
 * filled or outlined on any ground.
 *
 * This file keeps the numbers every rendering shares — the tile geometry, the
 * brand colours, and the mark's own path — so the React icon in `AppIcon.tsx`,
 * the raster icons `scripts/generate-icons.mjs` writes into `public/`, and the
 * mark inlined into printed receipts cannot drift apart. It is data, not a
 * component.
 */

/** The square the icon is drawn in. */
export const VIEW_BOX = 24;

/**
 * The tile the mark sits in. A rounded square, deliberately plain: the
 * identity is the mark, and the tile is only its ground.
 */
export const CONTAINER = {
  /** Corner radius in viewBox units (5.4/24 ≈ the CSS `rounded-xl` ratio). */
  cornerRadius: 5.4,
} as const;

/**
 * The brand colours, by name, for anything that cannot read CSS variables.
 *
 * The approved identity: a dark-to-medium green tile with a glowing rim, the
 * mark stroked in vivid emerald (#10B981) and a gold highlight (#F59E0B)
 * banded across the centre fold — the one warm note in an all-green mark.
 */
export const BRAND = {
  /** The deep emerald the tile is filled with. */
  deep: "#064E3B",
  /** The mid emerald of the lit tile. */
  ink: "#0A5E48",
  /** The near-black foot of the tile's gradient. */
  night: "#061A14",
  /** The highlight green of the lit edge — pale enough to never read as ink. */
  mint: "#A7F3D0",
  /** The warm highlight at the gradient's origin. */
  glow: "#0E7A5C",
  /** The emerald the mark is drawn in (#10B981). */
  letter: "#10B981",
  /** The gold band across the centre fold (#F59E0B). */
  gold: "#F59E0B",
  /** Pure white, for the gloss stops. */
  white: "#FFFFFF",
} as const;

/**
 * How the mark's stroke is painted when detail is on: emerald, lifting to gold
 * across the centre fold (y 4 → 20 on the 24-unit grid, gold peaking at the
 * tangency, y 12) and back. The same stops feed AppIcon, Logo and the raster
 * generator so the gold band lands on the fold in every rendering.
 */
export const MARK_PAINT = {
  x1: 12,
  y1: 4,
  x2: 12,
  y2: 20,
  stops: [
    { offset: "0%", color: BRAND.letter },
    { offset: "38%", color: BRAND.letter },
    { offset: "50%", color: BRAND.gold },
    { offset: "62%", color: BRAND.letter },
    { offset: "100%", color: BRAND.letter },
  ],
} as const;

/**
 * The mark itself: a stroked path on the 24-unit grid.
 *
 * Geometry, in full, so it can be reasoned about without a renderer:
 *
 * - The upper bowl is the circle centred (12, 8) with radius 4; the lower bowl
 *   is the circle centred (12, 16) with the same radius. The two are tangent
 *   at (12, 12) — the centre of the tile — so the two arcs join with one
 *   continuous horizontal tangent and no visible seam.
 * - The stroke starts at (14, 4.54) — 1 o'clock on the upper bowl — runs
 *   counterclockwise over the top, down the left side and along the bottom of
 *   the upper bowl to the tangency, then clockwise round the right side and
 *   the bottom of the lower bowl, finishing at (10, 19.46) — 7 o'clock, the
 *   point-symmetric partner of the start.
 * - Terminals are cut flat (butt caps) against the tangent, which slants each
 *   end and keeps the mark engineered rather than typeset.
 * - The ink box is x 6.4–17.6, y 2.4–21.6: taller than wide, centred, with
 *   real margin inside the tile, which is what lets the same path serve the
 *   16-pixel favicon and the 512-pixel store icon without a second drawing.
 *
 * A stroked path has no font dependency, so this renders identically in the
 * browser, in headless Chromium, and inside a receipt file printed from a
 * phone with no network.
 */
export const MARK = {
  /** The path of the mark, in viewBox units. */
  path: "M14 4.54 A4 4 0 1 0 12 12 A4 4 0 1 1 10 19.46",
  /** Stroke width in viewBox units. */
  stroke: 3.2,
  /** Flat terminals: the slant comes from the tangent, not from a font. */
  linecap: "butt" as const,
} as const;
