import { cn } from "@/lib/utils";

import { AppIcon } from "./AppIcon";
import { Mark } from "./Mark";

/**
 * RAVQEN's identity, symbol first.
 *
 * The app icon carries the identity on its own. The wordmark is optional and
 * only appears where there is room and a reason for it — the splash screen, the
 * sign-in screen, the empty state before a shop exists. Everywhere dense, the
 * symbol stands alone, because a wordmark in a 56px bar is decoration that costs
 * legibility and buys nothing.
 *
 * `tone` selects the ground the symbol sits on, because a dark mark on a dark
 * bar is invisible and a light mark on a white receipt is a smudge.
 */
export function Logo({
  className,
  tone = "ink",
  showTagline = false,
  compact = false,
  markSize = "size-8",
}: {
  className?: string;
  tone?: "ink" | "light";
  showTagline?: boolean;
  /** Symbol only. The default everywhere the wordmark would crowd the screen. */
  compact?: boolean;
  /**
   * The symbol's size, as a Tailwind class. It is a class rather than a number
   * because the mark is sized in the same scale as the type around it, and every
   * caller already picks a size for that reason.
   */
  markSize?: string;
}) {
  // On a dark ground the symbol loses its container and becomes a plain mark in
  // the light ink, which is how a symbol behaves when it is placed rather than
  // installed.
  const bare = tone === "light";

  const symbol = bare ? (
    <Mark className={cn(markSize, "text-champagne")} title="RAVQEN" />
  ) : (
    <AppIcon className={markSize} title="RAVQEN" />
  );

  if (compact) return symbol;

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {symbol}
      <span className="leading-none">
        <span
          className={cn(
            "block font-display text-base font-semibold tracking-[0.02em]",
            tone === "ink" ? "text-foreground" : "text-background",
          )}
        >
          RAVQEN
        </span>
        {showTagline ? (
          <span
            className={cn(
              "mt-1 block text-[11px] tracking-wide",
              tone === "ink" ? "text-muted-foreground" : "text-champagne/80",
            )}
          >
            Every sale. Every stock. Every number.
          </span>
        ) : null}
      </span>
    </div>
  );
}
