import { BRAND, GLYPH } from "./mark-geometry";

/**
 * The mark's geometry as drawable content, with no `<svg>` wrapper of its own.
 *
 * Split out from `Mark` so the app icon can place the symbol *inside* its own
 * viewport. A nested `<svg>` establishes a second viewport, and the two then
 * disagree about scale; one set of paths placed directly inside one viewport
 * cannot.
 *
 * ## How the material is built
 *
 * The symbol is a piece of folded glass, and folding is a lighting problem, not
 * a shape problem. Three fills carry it:
 *
 *   1. **A base gradient per ribbon**, aligned with the ribbon rather than with
 *      the tile, so each one is lit from its own upper edge. A single gradient
 *      across the whole mark would make the bowl and the leg agree about which
 *      way the light falls, and they do not.
 *   2. **A crease**, a soft dark band drawn just inside the shaded side of each
 *      fold. It is a drawn shape rather than a blur on purpose: at 16 pixels a
 *      blur is mud, and the crease is the only thing in the mark that says the
 *      ribbons turn a corner rather than merely meeting.
 *   3. **A highlight**, a thin bright line along each lit edge, which is what
 *      makes the ribbons read as a surface catching light instead of as flat
 *      colour.
 *
 * The leg is drawn last so it folds *over* the bowl and the stem. That overlap
 * is the whole reason the mark reads as one piece of folded material rather
 * than three letters stacked up.
 */
export function MarkPaths({ tone = "duotone" }: { tone?: "duotone" | "mono" }) {
  // Fixed ids rather than `useId()` — see the note in AppIcon.tsx. These are
  // referenced as `url(#id)` and `clip-path: url(#id)`, so they have to be legal
  // CSS fragment identifiers, and they have to survive prerendering.
  const bowl = "ravqen-bowl";
  const stem = "ravqen-stem";
  const leg = "ravqen-leg";
  const bowlShade = "ravqen-bowl-shade";
  const stemShade = "ravqen-stem-shade";
  const legShade = "ravqen-leg-shade";
  const clipBowl = "ravqen-clip-bowl";
  const clipStem = "ravqen-clip-stem";
  const clipLeg = "ravqen-clip-leg";

  if (tone === "mono") {
    return (
      <g fill="currentColor">
        <path d={GLYPH.bowl} />
        <path d={GLYPH.stem} />
        <path d={GLYPH.leg} />
      </g>
    );
  }

  return (
    <>
      <defs>
        {/* The bowl: bright along the top bar, cooling into the fold. */}
        <linearGradient
          id={bowl}
          x1="6"
          y1="4.3"
          x2="17.4"
          y2="12.4"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={BRAND.white} />
          <stop offset="26%" stopColor={BRAND.cream} />
          <stop offset="58%" stopColor={BRAND.mint} />
          <stop offset="100%" stopColor="#5FBF9B" />
        </linearGradient>

        {/* The stem: lit on its top diagonal, falling away into the heel. */}
        <linearGradient
          id={stem}
          x1="10.9"
          y1="9.2"
          x2="6.1"
          y2="18.6"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={BRAND.cream} />
          <stop offset="38%" stopColor={BRAND.mint} />
          <stop offset="100%" stopColor="#3E9C7B" />
        </linearGradient>

        {/* The leg: the one ribbon that brightens as it falls. */}
        <linearGradient
          id={leg}
          x1="12.3"
          y1="12.1"
          x2="18.1"
          y2="20.5"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#4FAE8B" />
          <stop offset="46%" stopColor={BRAND.mint} />
          <stop offset="100%" stopColor={BRAND.champagne} />
        </linearGradient>

        {/* The three creases. Deep emerald, fading out as they leave the fold. */}
        <linearGradient
          id={bowlShade}
          x1="14.4"
          y1="7.4"
          x2="18.3"
          y2="12.9"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={BRAND.deep} stopOpacity="0.62" />
          <stop offset="100%" stopColor={BRAND.deep} stopOpacity="0" />
        </linearGradient>
        <linearGradient
          id={stemShade}
          x1="5.8"
          y1="12"
          x2="6.4"
          y2="19"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={BRAND.deep} stopOpacity="0" />
          <stop offset="100%" stopColor={BRAND.deep} stopOpacity="0.6" />
        </linearGradient>
        <linearGradient
          id={legShade}
          x1="13.1"
          y1="14.4"
          x2="15.9"
          y2="20"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor={BRAND.deep} stopOpacity="0.5" />
          <stop offset="100%" stopColor={BRAND.deep} stopOpacity="0" />
        </linearGradient>

        <clipPath id={clipBowl}>
          <path d={GLYPH.bowl} />
        </clipPath>
        <clipPath id={clipStem}>
          <path d={GLYPH.stem} />
        </clipPath>
        <clipPath id={clipLeg}>
          <path d={GLYPH.leg} />
        </clipPath>
      </defs>

      <path d={GLYPH.bowl} fill={`url(#${bowl})`} />
      <path d={GLYPH.stem} fill={`url(#${stem})`} />
      <path d={GLYPH.leg} fill={`url(#${leg})`} />

      {/*
        The creases. Each is a wide stroke run just inside the shaded side of
        its fold and clipped to its own ribbon, so it fades out rather than
        stopping at a line. Widths are wide and opacities are low on purpose:
        these are volume, not decoration.
      */}
      <g clipPath={`url(#${clipBowl})`}>
        <path
          d="M13.7 7.3 C14.5 8.4 14.85 9.3 15 10.2 L18.6 13.1"
          stroke={`url(#${bowlShade})`}
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <g clipPath={`url(#${clipStem})`}>
        <path
          d="M5.2 10.6 C5.2 14.2 5.5 16.6 6.3 18.1"
          stroke={`url(#${stemShade})`}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <g clipPath={`url(#${clipLeg})`}>
        <path
          d="M12.4 12.9 C13.5 14.9 14.7 16.9 15.6 19.9"
          stroke={`url(#${legShade})`}
          strokeWidth="2.8"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      {/* The highlights: a hairline along each lit edge. */}
      <g
        fill="none"
        stroke={BRAND.white}
        strokeLinecap="round"
        strokeOpacity="0.72"
        clipPath={`url(#${clipBowl})`}
      >
        <path
          d="M6.4 4.75 C8.8 4.6 11.6 4.6 13.8 4.78 C15.5 5 16.6 5.8 17.3 6.9"
          strokeWidth="0.34"
        />
      </g>
      <g
        fill="none"
        stroke={BRAND.white}
        strokeLinecap="round"
        strokeOpacity="0.6"
        clipPath={`url(#${clipStem})`}
      >
        <path d="M6.1 8.85 C7.8 9.72 9.8 10.72 11.5 11.78" strokeWidth="0.32" />
      </g>
      <g
        fill="none"
        stroke={BRAND.white}
        strokeLinecap="round"
        strokeOpacity="0.55"
        clipPath={`url(#${clipLeg})`}
      >
        <path d="M12.2 12.1 C14.1 13.8 16.2 16.3 17.9 19.1" strokeWidth="0.3" />
      </g>
    </>
  );
}
