import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The shared vocabulary of the app.
 *
 * Everything here exists to stop every screen from inventing its own rounded
 * box: rows, labels, numbers, status. Screens compose these instead of styling
 * from scratch, which is what makes a dozen modules look like one product.
 */

/** A quiet section heading. Replaces the old uppercase-tracking-widest blocks. */
export function SectionLabel({
  children,
  className,
  action,
}: {
  children: ReactNode;
  className?: string | undefined;
  action?: ReactNode;
}) {
  return (
    <div className={cn("mb-3 flex items-baseline justify-between gap-3", className)}>
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}

/**
 * The one figure a section is about, on its own surface.
 *
 * Different from `Stat` on purpose. `Stat` is a label/value pair that lives
 * inside a row or a header; `MetricCard` is a surface with a job — the top of a
 * dashboard, the totals beside a table — and it is opaque, because a number
 * inside glass over a moving page is a number you have to work to read.
 *
 * `hint` is for a comparison that is genuinely computable ("vs previous 7 days",
 * "of which 3 overdue"); it is never a decorative arrow, and when there is no
 * comparison the prop is simply omitted.
 */
export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "positive" | "negative" | "caution";
  icon?: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn("card-surface px-4 py-3.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <p
        className={cn(
          "tnum mt-1.5 font-display text-[1.45rem] font-semibold leading-none tracking-tight",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "caution" && "text-caution",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * A tappable list row: leading content, trailing content, optional chevron.
 * Rows are the app's default container — not cards.
 */
export function Row({
  className,
  onClick,
  href,
  as = "div",
  children,
  ...rest
}: {
  className?: string | undefined;
  onClick?: (() => void) | undefined;
  href?: string | undefined;
  as?: "div" | "button" | "a";
  children: ReactNode;
  [key: `data-${string}`]: unknown;
}) {
  const interactive = Boolean(onClick || href);
  const base = cn(
    "flex w-full items-center gap-3 px-4 py-3.5 text-left",
    "min-h-11 transition-colors",
    interactive && "hover:bg-accent/45 active:bg-accent/60",
    className,
  );

  if (as === "button") {
    return (
      <button type="button" onClick={onClick} className={base} {...rest}>
        {children}
      </button>
    );
  }
  if (as === "a" && href) {
    return (
      <a href={href} className={base} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <div onClick={onClick} className={base} {...rest}>
      {children}
    </div>
  );
}

/** Right-aligned content inside a Row. Keeps main/secondary text aligned. */
export function RowMain({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return <div className={cn("min-w-0 flex-1", className)}>{children}</div>;
}

export function RowEnd({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return <div className={cn("shrink-0 text-right", className)}>{children}</div>;
}

/**
 * A figure with its label. `size="lg"` is for the one number a screen is about.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
  size = "md",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "positive" | "negative" | "caution";
  size?: "md" | "lg";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "tnum mt-1 font-semibold leading-tight tracking-tight",
          size === "lg" ? "font-display text-[1.85rem] leading-none" : "text-base",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "caution" && "text-caution",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export type StatusTone = "neutral" | "positive" | "caution" | "negative" | "info";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  positive: "bg-positive-soft text-positive",
  caution: "bg-caution-soft text-caution",
  negative: "bg-negative-soft text-negative",
  info: "bg-info-soft text-info",
};

/** A small status pill. The only pill shape in the product. */
export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Stock status derived from real values only — the product's quantity and its
 * low-stock threshold, both read from the database.
 */
export function stockStatus(quantity: number, threshold: number): StatusTone {
  if (quantity <= 0) return "negative";
  if (quantity <= threshold) return "caution";
  return "positive";
}

export function stockStatusLabel(quantity: number, threshold: number): string {
  if (quantity <= 0) return "Out of stock";
  if (quantity <= threshold) return "Low stock";
  return "In stock";
}

/** Money, always tabular, never wrapping. */
export function Money({
  amount,
  currency = "KES",
  className,
  sign = false,
}: {
  amount: number;
  currency?: string | undefined;
  className?: string | undefined;
  sign?: boolean | undefined;
}) {
  const formatted = new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
  return (
    <span className={cn("tnum whitespace-nowrap", className)}>
      {sign && amount > 0 ? `+${formatted}` : formatted}
    </span>
  );
}

/**
 * WhatsApp glyph — Lucide ships no brand icons, so this one is drawn here
 * once and reused wherever the app hands a message to WhatsApp.
 */
export function WhatsAppIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
