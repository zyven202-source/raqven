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
    <div className={cn("mb-2 flex items-center justify-between gap-3", className)}>
      <h2 className="eyebrow">{children}</h2>
      {action}
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
    "flex w-full items-center gap-3 px-4 py-3 text-left",
    "min-h-11 transition-colors",
    interactive && "hover:bg-sunken active:bg-sunken",
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
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tnum mt-0.5 font-semibold leading-tight",
          size === "lg" ? "text-2xl" : "text-base",
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
