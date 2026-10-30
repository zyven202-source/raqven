import { Link } from "@tanstack/react-router";
import { CloudOff, Loader2, RefreshCw, ShieldCheck } from "lucide-react";

import { useOfflineSync } from "@/hooks/useOfflineSync";
import { cn } from "@/lib/utils";

/**
 * The connectivity and synchronization indicator.
 *
 * Three honest states, one tap into the sync screen:
 *
 *   • offline       — the network is confirmed gone, the till may queue sales
 *   • waiting (n)   — n operations are queued on this device
 *   • quiet         — connected, nothing waiting; it barely speaks
 *
 * It sits in the shop bar, always the same size, so the header never jumps
 * between states, and it never blocks the screen: an offline till that is
 * selling fine does not deserve a banner.
 */
export function SyncIndicator({ shopId }: { shopId: string }) {
  const { online, counts, syncing } = useOfflineSync(shopId);

  const state: "offline" | "waiting" | "syncing" | "quiet" = !online
    ? "offline"
    : syncing || counts.syncing > 0
      ? "syncing"
      : counts.total > 0
        ? "waiting"
        : "quiet";

  const label =
    state === "offline"
      ? `Offline — ${counts.total} sale${counts.total === 1 ? "" : "s"} waiting to sync`
      : state === "syncing"
        ? "Synchronizing"
        : state === "waiting"
          ? `${counts.total} waiting to sync`
          : "Everything synced";

  return (
    <Link
      to="/app/sync"
      search={{ shop: undefined }}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-md transition-colors active:bg-sunken",
        state === "offline" || state === "waiting"
          ? "text-caution"
          : state === "syncing"
            ? "text-positive"
            : "text-muted-foreground",
      )}
    >
      <span className="relative grid place-items-center">
        {state === "offline" ? (
          <CloudOff className="size-4" aria-hidden />
        ) : state === "syncing" ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : state === "waiting" ? (
          <RefreshCw className="size-4" aria-hidden />
        ) : (
          <ShieldCheck className="size-4" aria-hidden />
        )}
        {state === "waiting" && counts.total > 0 ? (
          <span className="tnum absolute -right-2 -top-2 grid min-w-[14px] place-items-center rounded-full bg-caution px-1 text-[9px] font-bold leading-none text-background">
            {counts.total > 9 ? "9+" : counts.total}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
