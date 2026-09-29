import { cn } from "@/lib/utils";

import { MarkPaths } from "./MarkPaths";
import { BARE_SCALE, markTransform, VIEW_BOX } from "./mark-geometry";

/**
 * RAVQEN's symbol on its own, with no tile behind it.
 *
 * Two treatments, and only two, because a mark has to survive being printed in
 * one ink on a thermal roll:
 *
 *   - `duotone` (default) — the brand gradient, for light grounds.
 *   - `mono` — a single `currentColor`, for the navigation, for a dark ground,
 *     and for anywhere a second colour would be a liability.
 *
 * The glyph is scaled up to fill its own square (`BARE_SCALE`). It is authored
 * with the margin of a tiled app icon, and keeping that margin here would draw a
 * 15px letter inside a 28px header.
 */
export function Mark({
  className,
  tone = "duotone",
  title,
}: {
  className?: string;
  tone?: "duotone" | "mono";
  /** Supply only when the mark is the sole content of a landmark. */
  title?: string;
}) {
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
      <g transform={markTransform(BARE_SCALE)}>
        <MarkPaths tone={tone} />
      </g>
    </svg>
  );
}
