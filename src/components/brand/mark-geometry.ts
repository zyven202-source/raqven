/**
 * RAVQEN's symbol, in one place.
 *
 * This file is the single source of truth for the mark's geometry. Both the
 * React component and `scripts/generate-icons.mjs` read it, so the app icon, the
 * navigation icon, the splash screen, the receipt header and the favicon are
 * provably the same shape rather than five drawings that look similar.
 *
 * ## What the mark is
 *
 * The R-fold: an "R" cut from three folded ribbons of light on a deep emerald
 * tile. It is drawn, not typed — a letterform would come with a typeface's
 * history attached, and this one has none.
 *
 *   - **The bowl.** A flat bar across the top, a 90° fold down the right, and a
 *     diagonal cut where the arm ends. The fold is what gives the mark its
 *     depth: the bar is not a rectangle, it is a piece of ribbon that has turned
 *     a corner, and the corner is where the light lands.
 *   - **The stem.** The left vertical, cut to a point at the top and folding
 *     round into a soft heel at the bottom. It is the heaviest of the three,
 *     which is what anchors the mark on the left.
 *   - **The leg.** The diagonal that falls to the lower right and ends on a
 *     broad flat cut. It carries the mark's momentum and its lowest point.
 *
 * Three separate shapes rather than one, because that is how it reads: the bowl
 * sits behind, the stem carries the middle, and the leg folds over both. The
 * open spaces between them — the notch under the bowl, the gap between the stem
 * and the leg — are what keep it legible when it is 16 pixels wide. `verify-mark.mjs`
 * measures them, because a mark that quietly fills in is the one failure a
 * mark cannot recover from.
 *
 * ## Why the paths are filled rather than stroked
 *
 * A stroke cannot express what this mark is made of. Its terminals are cuts at
 * three different angles, its ribbons taper, and its folds are faces rather than
 * outlines. Drawn as strokes those all collapse into the same rounded line and
 * the mark becomes a tick again. So the outlines are authored directly, as
 * filled paths, and everything downstream — the React render, the PNG encoder,
 * the measurements — reads the same three strings.
 */

export type Point = readonly [number, number];

/** The square the mark is drawn in. */
export const VIEW_BOX = 24;

/**
 * The tile the mark sits in. A superellipse, not a rounded rectangle: a
 * rounded rectangle still reads as a rectangle at icon sizes, whereas the
 * continuous curvature of a squircle reads as an object with a face.
 */
export const CONTAINER = {
  /** Exponent on the superellipse. 4 is a squircle; higher is closer to a circle. */
  exponent: 4.6,
  /** Half-width of the container, in viewBox units. */
  radius: 12,
  /** Where the mark's optical centre sits inside the container. */
  centre: [12, 12] as Point,
} as const;

/**
 * The glyph, as three filled outlines in back-to-front draw order.
 *
 * Authored in the 24-unit box at the proportions the symbol is drawn at: it
 * occupies a little over half the tile's width and about two thirds of its
 * height, sitting slightly below centre because the heavy part of the mark is
 * the leg and the eye squares that up.
 */
export const GLYPH = {
  /**
   * The bowl. A bar across the top, folded down at the right, cut off on the
   * diagonal. The left terminal is a steep chisel, which is what puts a sharp
   * point at the top-left corner of the mark.
   */
  bowl: [
    "M5.97 4.5",
    "C8.6 4.34 11.6 4.34 13.86 4.52",
    "C15.8 4.78 17.05 5.7 17.8 7.05",
    "C18.24 7.95 18.4 9.05 18.34 10.2",
    "L18.28 12.68",
    "L15 10.2",
    "C14.9 9.2 14.6 8.35 14.1 7.62",
    "C12.6 7.24 10.4 7.18 8.06 7.14",
    "Z",
  ].join(" "),

  /**
   * The stem. A point at the top-left, a long diagonal top edge falling to the
   * right, a straight right side, and a heel that turns through a soft curve
   * back up to the straight left edge.
   */
  stem: [
    "M5.69 8.52",
    "C7.6 9.5 9.8 10.6 11.62 11.72",
    "L11.51 18.34",
    "C10.4 18.62 9 18.66 7.9 18.56",
    "C6.6 18.3 5.85 17.4 5.71 16",
    "L5.69 8.52",
    "Z",
  ].join(" "),

  /**
   * The leg. It leaves the junction at 45°, tapers as it falls, and ends on a
   * broad shallow cut — the one terminal on the mark that is wider than it is
   * deep, and the reason the mark has somewhere to go.
   *
   * Its return edge deliberately cuts back *into* the stem rather than stopping
   * on the stem's edge. Touching at a single point would make the mark two
   * marks that happen to be adjacent; overlapping turns them into one piece of
   * folded material with a crease down the join, which is what the symbol is.
   */
  leg: [
    "M11.62 11.72",
    "C13.9 13.5 16.4 16.5 18.2 19.5",
    "L18.31 20.6",
    "L15.84 19.95",
    "C14.5 17.3 12.4 14.9 10.55 13.1",
    "C10.9 12.6 11.3 12.1 11.62 11.72",
    "Z",
  ].join(" "),
} as const;

/**
 * The glyph's bounding box, measured from the paths above.
 *
 * Written down rather than computed because three consumers need it and none of
 * them have a DOM: the app icon scales the glyph to a target inset inside the
 * tile, the icon generator zooms it for small sizes, and `verify-mark.mjs`
 * checks the mark sits where this says it does. If the paths are edited, these
 * numbers have to move with them — the verification script fails if they drift.
 */
export const GLYPH_BOUNDS = {
  minX: 5.7,
  minY: 4.42,
  maxX: 18.38,
  maxY: 20.55,
} as const;

/** The centre of the bounding box — where a scale-and-centre transform pivots. */
export const GLYPH_CENTRE: Point = [
  (GLYPH_BOUNDS.minX + GLYPH_BOUNDS.maxX) / 2,
  (GLYPH_BOUNDS.minY + GLYPH_BOUNDS.maxY) / 2,
];

/**
 * How far the glyph sits inside the tile, in viewBox units.
 *
 * Tighter than the reference tile, and deliberately so: the symbol is authored
 * with the breathing room of a brand sheet around it, and an app icon has no
 * sheet. At this inset the glyph is about four fifths of the tile's height,
 * which is what still reads at 32 pixels without the mark crowding the rim.
 */
export const ICON_INSET = 2.4;

/**
 * The same idea for the bare symbol, used on a dark ground where there is no
 * tile behind it. With nothing to sit inside, the mark is allowed to fill its
 * own box — otherwise a 28px header mark would be drawing a 15px letter.
 */
export const BARE_INSET = 0.6;

const glyphHeight = GLYPH_BOUNDS.maxY - GLYPH_BOUNDS.minY;

/** The scale that fits the glyph to `ICON_INSET` inside the tile. */
export const ICON_SCALE = (2 * (CONTAINER.radius - ICON_INSET)) / glyphHeight;

/** The scale that fits the glyph to `BARE_INSET` inside its own square. */
export const BARE_SCALE = (VIEW_BOX - 2 * BARE_INSET) / glyphHeight;

/**
 * The favicon and the manifest icons get a slightly enlarged glyph. The open
 * spaces in the mark are between two and four units wide; at 16 pixels the
 * narrowest of them is barely more than a pixel, so small sizes zoom in a
 * little to buy back the contrast.
 */
export const SMALL_SCALE = 1.1;

/**
 * An SVG transform that scales the glyph about its own centre and puts that
 * centre in the middle of the box.
 *
 * Both sizes live here rather than in a component because four consumers need
 * them and none of them should be able to disagree: the app icon, the bare
 * symbol, the icon generator and the receipt all place the same three paths, and
 * a scale chosen in two places is a scale that drifts.
 */
export function markTransform(scale = ICON_SCALE): string {
  const [cx, cy] = GLYPH_CENTRE;
  return `translate(12 12) scale(${scale.toFixed(4)}) translate(${(-cx).toFixed(3)} ${(-cy).toFixed(3)})`;
}

/** Brand colour stops, kept here so the mark and the shell cannot drift apart. */
export const BRAND = {
  deep: "#032F25",
  ink: "#064E3B",
  teal: "#0B6B52",
  mint: "#A7E8CE",
  champagne: "#F8E7C9",
  cream: "#F7F2E8",
  white: "#FFFFFF",
} as const;
