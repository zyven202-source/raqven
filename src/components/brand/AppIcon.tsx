import { cn } from "@/lib/utils";

import { BRAND, CONTAINER, MARK, MARK_PAINT, VIEW_BOX } from "./mark-geometry";

/**
 * SAVO's mark tile, without the wordmark.
 *
 * One place draws the app-icon shape: the Savo mark stroked in emerald with a
 * gold band across the centre fold, on the deep-emerald tile. Every number it
 * uses comes from `mark-geometry.ts`,
 * which `scripts/generate-icons.mjs` also reads, so the raster icons in
 * `public/` and this component cannot drift apart.
 *
 * `detail={false}` drops the gloss and the rim. That is the variant for
 * anywhere the icon has to survive at 16 pixels: at that size a gloss is mud
 * and flat ink on a flat ground is the only thing that still reads.
 */
export function AppIcon({
  className,
  detail = true,
  title,
}: {
  className?: string;
  /** Turn off the lighting. Use for favicons and very small sizes. */
  detail?: boolean;
  title?: string;
}) {
  // Fixed ids, not `useId()`: these strings are referenced as `url(#id)` and
  // `href="#id"`, and a generated id there breaks the reference at best and
  // breaks prerendering hydration at worst. Every instance defines the same
  // gradients, so a duplicate id resolves to the same gradient either way.
  const shell = "savo-shell";
  const gloss = "savo-gloss";
  const rim = "savo-rim";
  const shape = "savo-shape";
  const paint = "savo-letter";

  const r = CONTAINER.cornerRadius;

  return (
    <svg
      viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
      className={cn("block", className)}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}

      <defs>
        {/* The tile, lit from the upper left. */}
        <radialGradient id={shell} cx="0.33" cy="0.2" r="1.05">
          <stop offset="0%" stopColor={BRAND.glow} />
          <stop offset="38%" stopColor={BRAND.ink} />
          <stop offset="78%" stopColor={BRAND.deep} />
          <stop offset="100%" stopColor={BRAND.night} />
        </radialGradient>

        {/* The mark's paint: emerald lifting to gold across the centre fold. */}
        <linearGradient
          id={paint}
          x1={MARK_PAINT.x1}
          y1={MARK_PAINT.y1}
          x2={MARK_PAINT.x2}
          y2={MARK_PAINT.y2}
        >
          {MARK_PAINT.stops.map((stop) => (
            <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </linearGradient>

        {/* A broad gloss across the top third. */}
        <linearGradient id={gloss} x1="12" y1="0" x2="12" y2="13">
          <stop offset="0%" stopColor={BRAND.white} stopOpacity="0.26" />
          <stop offset="100%" stopColor={BRAND.white} stopOpacity="0" />
        </linearGradient>

        {/* A bright hairline along the lit edge, fading round the far side. */}
        <linearGradient id={rim} x1="2" y1="1.5" x2="21" y2="22">
          <stop offset="0%" stopColor={BRAND.mint} stopOpacity="0.95" />
          <stop offset="45%" stopColor={BRAND.mint} stopOpacity="0.12" />
          <stop offset="100%" stopColor={BRAND.white} stopOpacity="0.22" />
        </linearGradient>

        <rect id={shape} x="0" y="0" width={VIEW_BOX} height={VIEW_BOX} rx={r} />
      </defs>

      <use href={`#${shape}`} fill={detail ? `url(#${shell})` : BRAND.deep} />
      {detail ? (
        <>
          <use href={`#${shape}`} fill={`url(#${gloss})`} />
          <use href={`#${shape}`} fill="none" stroke={`url(#${rim})`} strokeWidth="0.55" />
        </>
      ) : null}

      {/* The mark: one continuous stroke, emerald with the gold fold. */}
      <path
        d={MARK.path}
        fill="none"
        stroke={detail ? `url(#${paint})` : BRAND.letter}
        strokeWidth={MARK.stroke}
        strokeLinecap={MARK.linecap}
      />
    </svg>
  );
}
