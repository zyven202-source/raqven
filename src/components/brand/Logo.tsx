import { cn } from "@/lib/utils";

import { MARK, VIEW_BOX } from "./mark-geometry";

interface LogoProps {
  className?: string;
  tone?: "ink" | "light";
  showTagline?: boolean;
  compact?: boolean;
  /** Kept so existing callers keep working; it sizes the mark tile. */
  markSize?: string;
}

/**
 * SAVO's logo: the Savo mark beside the wordmark.
 *
 * The identity is the drawn mark — one continuous stroke over two tangent
 * bowls — not a typeset letter and not a generic trade icon. The wordmark is
 * optional and only appears where there is room for it (splash, sign-in, the
 * pre-shop empty state); everywhere dense, the tile stands alone.
 *
 * `tone` selects the ground, because a dark mark on a dark bar is invisible
 * and a light mark on a white receipt is a smudge:
 *
 *   - `ink` — the emerald tile with the champagne mark.
 *   - `light` — the bare mark in champagne, for dark grounds.
 */
export function Logo({
  className,
  tone = "ink",
  showTagline = false,
  compact = false,
  markSize = "size-9",
}: LogoProps) {
  const bare = tone === "light";
  const sizeClass = markSize === "size-8" ? "size-9" : markSize;

  const tile = (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-xl",
        sizeClass,
        // The colour sits under the gradient image so the mark always has its
        // dark ground — including in print stylesheets and anywhere a
        // background image does not paint.
        bare ? "text-champagne" : "gradient-ink bg-ink-deep text-champagne",
      )}
      aria-hidden
    >
      <svg
        viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
        className="size-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d={MARK.path}
          stroke="currentColor"
          strokeWidth={MARK.stroke}
          strokeLinecap={MARK.linecap}
        />
      </svg>
    </span>
  );

  if (compact) return tile;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {tile}
      <span className="leading-none">
        <span
          className={cn(
            "block font-display text-lg font-semibold tracking-tight",
            bare ? "text-background" : "text-foreground",
          )}
        >
          SAVO
        </span>
        {showTagline ? (
          <span
            className={cn(
              "mt-1 block text-[11px] tracking-wide",
              bare ? "text-champagne/80" : "text-muted-foreground",
            )}
          >
            Every sale. Every stock. Every number.
          </span>
        ) : null}
      </span>
    </div>
  );
}
