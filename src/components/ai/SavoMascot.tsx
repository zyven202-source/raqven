import { cn } from "@/lib/utils";

/**
 * The SAVO AI assistant's face.
 *
 * The artwork is the image the owner supplied, shipped as one raster set in
 * `public/` (`assistant-icon.png`, with a 512px copy for larger placements).
 * It replaced the hand-drawn SVG robot: a drawn character and a supplied
 * illustration cannot both be canonical, and the supplied one is the answer to
 * "what does the assistant look like".
 *
 * Rendering the same file everywhere means the launcher, the messages, the
 * Studio preview and any downloaded copy cannot drift apart — there is no
 * second drawing of the character anywhere in the codebase.
 *
 * `expression` is accepted for the call sites that pass it (the launcher shows
 * a different face when the panel is open) but a single-piece illustration has
 * no variants to switch between; the prop no longer changes the drawing.
 */
export const ASSISTANT_ICON_SRC = "/assistant-icon.png";
export const ASSISTANT_ICON_DOWNLOAD = "savo-ai-assistant.png";

export function SavoMascot({
  className,
  title,
}: {
  className?: string;
  /** Accepted for compatibility; the supplied artwork has one expression. */
  expression?: "idle" | "thinking" | "happy";
  title?: string;
}) {
  return (
    <img
      src={ASSISTANT_ICON_SRC}
      alt={title ?? ""}
      aria-hidden={title ? undefined : true}
      className={cn("block object-contain", className)}
      draggable={false}
    />
  );
}
