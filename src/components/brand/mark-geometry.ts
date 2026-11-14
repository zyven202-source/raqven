/**
 * SAVO's brand data, in one place.
 *
 * The identity is a drawn monogram, not a typeset letter: one continuous
 * stroke that forms a P — a straight stem and a single round bowl — with the
 * terminals cut flat against the tangent so the shape reads as engineered
 * rather than written. It is legible at 16 pixels, prints on a receipt in one
 * ink, and works as an outline on paper or reversed out of forest green.
 *
 * This file keeps the numbers every rendering shares — the tile geometry, the
 * brand colours, and the mark's own path — so the React components and the
 * raster icons in `public/` cannot drift apart. It is data, not a component.
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
 * The palette is SAVO's: forest green, deep green, soft mint, warm cream.
 */
export const BRAND = {
  /** Deep forest — the darkest ground. #09291F */
  deep: "#09291f",
  /** Forest — the tile. #123C2D */
  ink: "#123c2d",
  /** The near-black foot of the tile's gradient. */
  night: "#061e17",
  /** Soft mint — the mark on the tile, and the lightest green. #DDEBDD */
  mint: "#ddebdd",
  /** The lit top-left of the tile. #236B49 */
  glow: "#236b49",
  /** Supporting green — the mark when it is drawn in ink. #236B49 */
  letter: "#236b49",
  /** Warm cream — the page, and the mark's highlight. #F7F5EE */
  cream: "#f7f5ee",
  /** Pure white, for the gloss stops. */
  white: "#ffffff",
} as const;

/**
 * How the mark's stroke is painted when detail is on: mint at the top of the
 * bowl, warm cream across the middle — one soft highlight, no second hue.
 */
export const MARK_PAINT = {
  x1: 12,
  y1: 3,
  x2: 12,
  y2: 14,
  stops: [
    { offset: "0%", color: BRAND.mint },
    { offset: "55%", color: BRAND.cream },
    { offset: "100%", color: BRAND.mint },
  ],
} as const;

/**
 * The mark itself: a P, stroked as one path on the 24-unit grid.
 *
 * Geometry, in full, so it can be reasoned about without a renderer:
 *
 * - The stem rises at x ≈ 8.1 from y 20.2 to y 4.1 — full height, so the
 *   monogram fills the tile's optical box the way a capital does.
 * - The bowl is a single arc springing from the top of the stem, round to
 *   the right and returning to the stem at y ≈ 12.9 — slightly more than
 *   half the stem's height, which is what keeps it reading as a P and not as
 *   a lowercase p or a flag.
 * - Terminals are cut flat, so each end sits on the tangent and the shape
 *   looks drawn rather than handwritten.
 * - The ink box is x 8.1–19.4, y 4.1–20.2: taller than wide, with real margin
 *   inside the tile, so the same path serves the 16-pixel favicon and the
 *   512-pixel app icon without a second drawing.
 *
 * A stroked path has no font dependency, so this renders identically in the
 * browser and in a receipt file printed from a phone with no network.
 */
export const MARK = {
  /**
   * A receipt, drawn as one stroked path on the 24-unit grid: the paper, its
   * torn lower edge, and three ruled lines. It is what the product is — a
   * record of a sale — and it prints in one ink on a thermal receipt.
   */
  path: "M6.5 3.2h11v16.6l-2.2-1.5-2.2 1.5-2.2-1.5-2.2 1.5L6.5 19.8z M9.4 8.2h5.2 M9.4 11.4h5.2 M9.4 14.6h3.4",
  /** Stroke width in viewBox units. */
  stroke: 1.5,
  /** Rounded terminals: a printed mark, not a typeface. */
  linecap: "round" as const,
} as const;
