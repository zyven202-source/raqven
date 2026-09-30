import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  tone?: "ink" | "light";
  showTagline?: boolean;
  compact?: boolean;
  /** Kept so existing callers keep working; it sizes the R tile. */
  markSize?: string;
}

/**
 * RAVQEN's logo: a simple typographic R.
 *
 * The identity is the letter itself — the display face's R in champagne on the
 * deep-emerald tile — not a drawn symbol. Deliberately plain: at a glance it is
 * a letter, not a logo system, and that is what the owner asked for. The
 * wordmark is optional and only appears where there is room for it (splash,
 * sign-in, the pre-shop empty state); everywhere dense, the tile stands alone.
 *
 * `tone` selects the ground, because a dark mark on a dark bar is invisible and
 * a light mark on a white receipt is a smudge:
 *
 *   - `ink` — the emerald tile with the champagne R.
 *   - `light` — a bare champagne R on nothing, for dark grounds.
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
        "grid shrink-0 place-items-center rounded-xl font-display text-lg font-semibold",
        sizeClass,
        // The colour sits under the gradient image so the R always has its
        // dark ground — including in print stylesheets and anywhere a
        // background image does not paint.
        bare ? "text-champagne" : "gradient-ink bg-ink-deep text-champagne",
      )}
      aria-hidden
    >
      R
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
          RAVQEN
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
