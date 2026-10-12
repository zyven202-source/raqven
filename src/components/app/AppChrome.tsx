import { useEffect, useState } from "react";
import { Loader2, RefreshCw, WifiOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { AppIcon } from "@/components/brand/AppIcon";
import { Button } from "@/components/ui/button";

/**
 * Mobile-first page scaffold: padded scroll body, clear of the bottom nav.
 *
 * The bottom padding is the navigation's clearance. The bar floats, so nothing
 * about it can push the page down — the space has to be reserved here instead,
 * and it has to include the phone's gesture-bar inset.
 */
export function PageContainer({
  className,
  children,
}: {
  className?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-2xl px-4 pb-[calc(env(safe-area-inset-bottom)+6rem)] pt-3 sm:px-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Page title. `meta` is the one line of orientation a screen genuinely needs;
 * subtitles that restate the title are removed rather than reworded.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string | undefined;
  action?: React.ReactNode | undefined;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.375rem] leading-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
    </header>
  );
}

/**
 * A loading indicator that cannot lie.
 *
 * After `timeoutMs` it stops spinning and admits the request has not come back,
 * offering a retry instead of leaving the user watching a spinner on a bad
 * connection. This is the fix for the "stuck on Loading…" screens.
 *
 * The symbol is here rather than only on the first paint because a spinner on
 * its own is the least branded thing a product can show a user, and this is what
 * they stare at every time a screen is slow.
 */
export function LoadingState({
  label = "Loading…",
  timeoutMs = 12_000,
  onRetry,
}: {
  label?: string | undefined;
  timeoutMs?: number | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setStalled(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [timeoutMs]);

  if (stalled) {
    return (
      <StateBlock
        icon={<WifiOff className="size-5" aria-hidden />}
        title="This is taking too long"
        body="The connection may have dropped. Nothing has been changed."
        action={
          onRetry ? (
            <Button variant="outline" onClick={onRetry}>
              <RefreshCw /> Try again
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      <AppIcon className="size-11" title="SAVO" />
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  );
}

/**
 * One layout for every non-happy state, so a screen never invents its own.
 *
 * `mark` gives the block the product's symbol as its illustration, which is what
 * a screen with nothing specific to report should show. A state that *does* have
 * something specific — a dropped connection, a permission boundary — passes an
 * `icon` instead, and the icon wins: a reason beats a logo.
 */
export function StateBlock({
  icon,
  mark = false,
  title,
  body,
  action,
  tone = "neutral",
}: {
  icon?: React.ReactNode;
  /** Use the symbol as the illustration. Ignored when `icon` is given. */
  mark?: boolean;
  title: string;
  body?: string | undefined;
  action?: React.ReactNode | undefined;
  tone?: "neutral" | "danger";
}) {
  const illustrated = !icon && mark;
  return (
    <div
      className="flex flex-col items-center gap-2 px-6 py-10 text-center"
      role="status"
      aria-live="polite"
    >
      {icon ? (
        <span
          className={cn(
            "grid size-10 place-items-center rounded-full",
            tone === "danger"
              ? "bg-negative-soft text-negative"
              : "bg-sunken text-muted-foreground",
          )}
        >
          {icon}
        </span>
      ) : null}
      {illustrated ? <AppIcon className="size-10" title="SAVO" /> : null}
      {/*
        The rule under the mark is the only thing that tells a reader whether
        the state is ordinary or a failure — the symbol itself is the same in
        both, and on a danger state it should not shout.
      */}
      {illustrated ? (
        <span
          aria-hidden
          className={cn("mt-1 h-px w-10", tone === "danger" ? "bg-negative/50" : "bg-border")}
        />
      ) : null}
      <p className="text-[0.9375rem] font-semibold">{title}</p>
      {body ? (
        <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">{body}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/** Error state with a recovery action. Never a dead end. */
export function ErrorState({
  message,
  onRetry,
  title = "Couldn't load this",
}: {
  message: string;
  onRetry?: (() => void) | undefined;
  title?: string | undefined;
}) {
  return (
    <StateBlock
      tone="danger"
      mark
      title={title}
      body={message}
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            <RefreshCw /> Try again
          </Button>
        ) : undefined
      }
    />
  );
}

/** Empty state with a primary action, so a blank screen is never a dead end. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string | undefined;
  action?: React.ReactNode | undefined;
}) {
  return <StateBlock mark title={title} body={description} action={action} />;
}

/**
 * Small, honest note used where a screen deliberately shows no data — a
 * permission boundary, a feature that is switched off, a report with no rows.
 * Distinct from EmptyState: nothing is missing here, the answer is elsewhere.
 */
export function NoticeState({
  title,
  description,
  tone = "neutral",
  icon,
}: {
  title: string;
  description: string;
  tone?: "neutral" | "danger";
  icon?: React.ReactNode | undefined;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm",
        tone === "danger" ? "border-negative/30 bg-negative-soft/60" : "border-border bg-sunken",
      )}
    >
      {icon ? <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span> : null}
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-0.5 leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
