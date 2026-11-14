import { Download, RefreshCw, WifiOff, X } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Two slivers of truth, one place.
 *
 * `OfflineBanner` — the network is gone. SAVO is online-first: pages you
 * have already opened may still render, but reads and writes that need
 * Supabase will fail until it returns, and pretending otherwise would be a
 * lie with a ledger's worth of damage. Rendered only while the offline state
 * is probe-confirmed — a real request to our own origin failed — because the
 * browser's online/offline signals alone have been caught lying over a
 * working till. Out of the way, above the content.
 *
 * `UpdateBanner` — a new version has been downloaded and is waiting. The user
 * chooses when to apply it; nothing reloads underneath a half-entered sale,
 * and the notice can be dismissed for the moment — it will be offered again
 * on the next load, because an update the owner never installs is a version
 * that never ships to that phone.
 */
export function OfflineBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-2"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-caution/40 bg-caution-soft px-3.5 py-1.5 text-xs font-medium text-caution shadow-sm">
        <WifiOff className="size-3.5" aria-hidden />
        <span>Offline — some things won't load until the network returns.</span>
      </div>
    </div>
  );
}

export function UpdateBanner({
  onUpdate,
  onDismiss,
}: {
  onUpdate: () => void;
  onDismiss?: (() => void) | undefined;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-2"
    >
      <div className="glass-3 pointer-events-auto flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur-xl">
        <Download className="size-3.5" aria-hidden />
        <span>A new version is ready</span>
        <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={onUpdate}>
          <RefreshCw className="size-3" aria-hidden />
          Update
        </Button>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss the update notice"
            className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors active:bg-ink/5"
          >
            <X className="size-3" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}
