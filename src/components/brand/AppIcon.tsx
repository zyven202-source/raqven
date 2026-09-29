import { cn } from "@/lib/utils";

import { BRAND, CONTAINER, ICON_SCALE, markTransform, VIEW_BOX } from "./mark-geometry";
import { MarkPaths } from "./MarkPaths";

/**
 * RAVQEN's app icon: the symbol on its own tile, with no wordmark.
 *
 * The container is a superellipse rather than a rounded rectangle, because a
 * rounded rectangle still reads as a rectangle at icon sizes while a squircle
 * reads as an object with a face. Four things make it look like a lit object
 * rather than a flat swatch — a radial ground, a rim light along the upper-left
 * edge, a broad gloss across the top, and a specular hotspot where the light
 * lands — and all four are cheap, which is why they earn their place.
 *
 * `detail={false}` drops all four. That is the variant for anywhere the icon has
 * to survive at 16 pixels: at that size a gloss, a rim and a two-stop gradient
 * are all mud, and a flat high-contrast mark is the only thing that still reads.
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
  // Fixed ids, not `useId()`.
  //
  // React's generated ids are not guaranteed to be legal CSS fragment
  // identifiers, and these strings are referenced as `url(#id)` and `href="#id"`.
  // A generated id there breaks the reference at best and, on the prerendered
  // landing page, produces a server/client mismatch that React reports as a
  // hydration failure. Every instance defines the same gradients with the same
  // stops, so a shared id is safe — a duplicate resolves to the first, which is
  // the same gradient either way.
  const shell = "ravqen-shell";
  const gloss = "ravqen-gloss";
  const rim = "ravqen-rim";
  const sheen = "ravqen-sheen";
  const shape = "ravqen-shape";

  const r = CONTAINER.radius;

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
        {/* The tile. Lit from the upper left, falling to near-black at the foot. */}
        <radialGradient id={shell} cx="0.33" cy="0.2" r="1.05">
          <stop offset="0%" stopColor="#0E6B51" />
          <stop offset="38%" stopColor={BRAND.ink} />
          <stop offset="78%" stopColor={BRAND.deep} />
          <stop offset="100%" stopColor="#021A14" />
        </radialGradient>

        {/* The broad gloss across the top third. */}
        <linearGradient id={gloss} x1="12" y1="0" x2="12" y2="13">
          <stop offset="0%" stopColor={BRAND.white} stopOpacity="0.26" />
          <stop offset="100%" stopColor={BRAND.white} stopOpacity="0" />
        </linearGradient>

        {/* Where the light actually lands: a soft specular near the top-left. */}
        <radialGradient id={sheen} cx="0.3" cy="0.16" r="0.42">
          <stop offset="0%" stopColor={BRAND.white} stopOpacity="0.5" />
          <stop offset="55%" stopColor={BRAND.mint} stopOpacity="0.12" />
          <stop offset="100%" stopColor={BRAND.mint} stopOpacity="0" />
        </radialGradient>

        {/* The rim: a bright hairline along the lit edge, fading round the far side. */}
        <linearGradient id={rim} x1="2" y1="1.5" x2="21" y2="22">
          <stop offset="0%" stopColor={BRAND.mint} stopOpacity="0.95" />
          <stop offset="45%" stopColor={BRAND.mint} stopOpacity="0.12" />
          <stop offset="100%" stopColor={BRAND.white} stopOpacity="0.22" />
        </linearGradient>

        <path id={shape} d={squirclePath(r, CONTAINER.exponent)} />
      </defs>

      <use href={`#${shape}`} fill={detail ? `url(#${shell})` : BRAND.deep} />
      {detail ? (
        <>
          <use href={`#${shape}`} fill={`url(#${gloss})`} />
          <use href={`#${shape}`} fill={`url(#${sheen})`} />
          <use href={`#${shape}`} fill="none" stroke={`url(#${rim})`} strokeWidth="0.55" />
        </>
      ) : null}

      {/* The symbol, scaled to its own inset so it never crowds the tile edge. */}
      <g transform={markTransform()}>
        <MarkPaths tone={detail ? "duotone" : "mono"} />
      </g>
    </svg>
  );
}

/**
 * A superellipse as an SVG path.
 *
 * Sampled rather than solved: a path is the only shape every renderer, icon
 * pipeline and print driver agrees on, and 96 segments is far more than a
 * squircle's curvature needs to look smooth.
 */
function squirclePath(radius: number, exponent: number, segments = 96): string {
  const points: string[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    const cos = Math.cos(t);
    const sin = Math.sin(t);
    const x = radius * Math.sign(cos) * Math.abs(cos) ** (2 / exponent);
    const y = radius * Math.sign(sin) * Math.abs(sin) ** (2 / exponent);
    points.push(`${x.toFixed(3)} ${y.toFixed(3)}`);
  }
  return `M ${points.join(" L ")} Z`;
}
