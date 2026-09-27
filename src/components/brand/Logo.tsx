import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  tone?: "ink" | "light";
  showTagline?: boolean;
}

export function Logo({ className, tone = "ink", showTagline = false }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-xl font-display text-lg font-semibold",
          tone === "ink"
            ? "gradient-ink text-champagne"
            : "bg-champagne text-ink-deep",
        )}
        aria-hidden
      >
        R
      </span>
      <span className="leading-none">
        <span
          className={cn(
            "block font-display text-lg font-semibold tracking-tight",
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
