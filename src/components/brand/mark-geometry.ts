/**
 * RAVQEN's brand data, in one place.
 *
 * The identity is a simple typographic R: the display face's R in champagne on
 * a deep-emerald tile. This file keeps the numbers that every rendering of it
 * shares — the tile geometry, the brand colours, the placement of the R — so
 * the React icon in `AppIcon.tsx` and the raster icons that
 * `scripts/generate-icons.mjs` writes into `public/` cannot drift apart. It is
 * data, not a component.
 *
 * ## Why a letter, and why this file is small
 *
 * The owner chose the simple typographic R over the previous drawn mark. A
 * letter needs no geometry of its own — the display face already has one — so
 * this file keeps only what rendering still has to agree on: where the R sits,
 * how big it is, and the colours. Everything that was specific to the drawn
 * mark was deleted with it rather than kept "just in case".
 */

/** The square the icon is drawn in. */
export const VIEW_BOX = 24;

/**
 * The tile the R sits in. A rounded square, deliberately plain: the identity
 * is the letter, and the tile is only its ground.
 */
export const CONTAINER = {
  /** Corner radius in viewBox units (5.4/24 ≈ the CSS `rounded-xl` ratio). */
  cornerRadius: 5.4,
} as const;

/** The brand colours, by name, for anything that cannot read CSS variables. */
export const BRAND = {
  /** The deep emerald the tile is filled with. */
  deep: "oklch(0.273 0.05 173.3)",
  /** The mid emerald of the lit tile. */
  ink: "oklch(0.378 0.073 168.9)",
  /** The near-black foot of the tile's gradient. */
  night: "#021A14",
  /** The highlight green of the lit edge. */
  mint: "#7DD3B4",
  /** The warm highlight at the gradient's origin. */
  glow: "#0E6B51",
  /** The champagne the R is set in. */
  letter: "#F8E7C9",
  /** Pure white, for the gloss stops. */
  white: "#FFFFFF",
} as const;

/**
 * The R's placement, in viewBox units.
 *
 * Fraunces's cap height does not fill its em box, so the baseline is tuned by
 * eye against the rendered raster: x centres the glyph, y is the baseline, and
 * size is the font size that fills the tile the way the earlier logo did. The
 * generator imports these numbers, so nudging them here moves the app icon,
 * the favicon and the PNGs together.
 */
export const R_GLYPH = {
  /** Font family, matching `--font-display`. */
  family: "Fraunces, Georgia, 'Times New Roman', serif",
  size: 13.2,
  /** The glyph's baseline anchor, `[x, y]` in viewBox units. */
  baseline: [12, 16.55] as const,
} as const;
