import { Loader2, RefreshCw, Wrench } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Mobile-first page scaffold: padded scroll body, safe-area aware. */
export function PageContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-3xl px-4 pb-24 pt-4 sm:px-6", className)}>
      {children}
    </div>
  );
}

/** Large, always-visible page title used at the top of every module page. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** Full-height centered spinner with optional label. */
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="size-6 animate-spin text-ink-soft" aria-hidden />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** Actionable error panel with a retry hook. */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="surface-panel flex flex-col items-center gap-3 p-8 text-center">
      <p className="text-sm font-medium text-foreground">Something went wrong</p>
      <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry} className="mt-1">
          <RefreshCw /> Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Empty panel with an optional primary action. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="surface-panel flex flex-col items-center gap-2 p-8 text-center">
      <p className="font-medium text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/**
 * Honest placeholder for a module that is planned but not built yet.
 * States exactly what exists and what does not — no fake content, no dead
 * buttons. The spec requires this over pretending a feature works.
 */
export function ModulePlaceholder({
  title,
  description,
  bulletPoints,
}: {
  title: string;
  description: string;
  bulletPoints?: string[];
}) {
  return (
    <section className="surface-panel p-6 text-center sm:p-8" aria-live="polite">
      <span className="mx-auto grid size-11 place-items-center rounded-xl bg-secondary">
        <Wrench className="size-5 text-ink-soft" aria-hidden />
      </span>
      <h2 className="mt-4 text-lg">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {bulletPoints && bulletPoints.length > 0 ? (
        <ul className="mx-auto mt-5 max-w-sm space-y-2 text-left">
          {bulletPoints.map((point) => (
            <li
              key={point}
              className="flex items-start gap-2.5 rounded-lg bg-secondary/70 px-3.5 py-2.5 text-sm"
            >
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-soft" aria-hidden />
              {point}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-5 text-xs text-muted-foreground">
        This module is not built yet — no data is being created or changed here.
      </p>
    </section>
  );
}
