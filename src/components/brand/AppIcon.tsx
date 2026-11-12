import { cn } from "@/lib/utils";

import { BRAND, CONTAINER, MARK, MARK_PAINT, VIEW_BOX } from "./mark-geometry";

/**
 * Pith's mark tile, without the wordmark.
 *
 * One place draws the app-icon shape: the P monogram in mint on a forest tile
 * that is lit from the upper left. Every number it uses comes from
 * `mark-geometry.ts`, which `scripts/generate-icons.mjs` also reads, so the
 * raster icons in `public/` and this component cannot drift apart.
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
  const shell = "pith-shell";
  const gloss = "pith-gloss";
  const rim = "pith-rim";
  const shape = "pith-shape";
  const paint = "pith-letter";

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
          <stop offset="42%" stopColor={BRAND.ink} />
          <stop offset="82%" stopColor={BRAND.deep} />
          <stop offset="100%" stopColor={BRAND.night} />
        </radialGradient>

        {/* The monogram: mint lifting to cream across the bowl. */}
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
          <stop offset="0%" stopColor={BRAND.white} stopOpacity="0.16" />
          <stop offset="100%" stopColor={BRAND.white} stopOpacity="0" />
        </linearGradient>

        {/* A bright hairline along the lit edge, fading round the far side. */}
        <linearGradient id={rim} x1="2" y1="1.5" x2="21" y2="22">
          <stop offset="0%" stopColor={BRAND.mint} stopOpacity="0.6" />
          <stop offset="45%" stopColor={BRAND.mint} stopOpacity="0.08" />
          <stop offset="100%" stopColor={BRAND.white} stopOpacity="0.14" />
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

      {/* The monogram: one continuous stroke, mint on forest. */}
      <path
        d={MARK.path}
        fill="none"
        stroke={detail ? `url(#${paint})` : BRAND.mint}
        strokeWidth={MARK.stroke}
        strokeLinecap={MARK.linecap}
      />
    </svg>
  );
}
