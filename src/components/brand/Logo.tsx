import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  tone?: "ink" | "light";
  showTagline?: boolean;
  compact?: boolean;
  /** Kept so existing callers keep working; it sizes the mark tile. */
  markSize?: string;
}

/**
 * SAVO's logo: the app icon beside the wordmark.
 *
 * The icon is the identity — the green tile, the mint receipt and the SAVO
 * shelf label — so the logo uses the very image the browser installs, rather
 * than a second, hand-drawn version of it. `compact` returns the tile alone,
 * which is what dense chrome (the shop bar, the till header) should use: a
 * wordmark at 36 pixels is noise.
 *
 * `tone` only decides the wordmark colour, for a light or a forest ground.
 */
export function Logo({
  className,
  tone = "ink",
  showTagline = false,
  compact = false,
  markSize = "size-9",
}: LogoProps) {
  const reversed = tone === "light";

  const tile = (
    <span
      className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl", markSize)}
      aria-hidden
    >
      <img src="/icon-192.png" alt="" className="size-full object-cover" draggable={false} />
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
            reversed ? "text-cream" : "text-ink",
          )}
        >
          SAVO
        </span>
        {showTagline ? (
          <span
            className={cn(
              "mt-1 block text-[11px] tracking-wide",
              reversed ? "text-mint/85" : "text-muted-foreground",
            )}
          >
            Every sale. Every stock. Every number.
          </span>
        ) : null}
      </span>
    </div>
  );
}
