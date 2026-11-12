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
 * Pith's logo: the P monogram beside the wordmark.
 *
 * `tone` selects the ground, because a forest mark on a dark bar is invisible
 * and a mint mark on a white receipt is a smudge:
 *
 *   - `ink` — the plain mark in forest green, for paper grounds.
 *   - `light` — the reversed mark in mint, with a cream wordmark, for forest
 *     grounds such as the install screen or a dark receipt header.
 *
 * `compact` returns the monogram alone, which is what dense chrome (the shop
 * bar, the till header) should use — a wordmark at 40 pixels is noise.
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
      className={cn(
        "grid shrink-0 place-items-center rounded-xl",
        markSize,
        reversed ? "bg-ink-deep text-mint" : "bg-mint text-ink",
      )}
      aria-hidden
    >
      <svg
        viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
        className="size-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/*
          The mark is drawn in the tile's text colour, one ink and no gradient.
          The full app icon can afford a lit tile; at 36 pixels beside a
          wordmark a highlight is only a muddy edge, and mint-on-mint would not
          read at all.
        */}
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
            reversed ? "text-cream" : "text-ink",
          )}
        >
          Pith
        </span>
        {showTagline ? (
          <span
            className={cn(
              "mt-1 block text-[11px] tracking-wide",
              reversed ? "text-mint/85" : "text-muted-foreground",
            )}
          >
            Run. Track. Grow.
          </span>
        ) : null}
      </span>
    </div>
  );
}
