import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw, WifiOff } from "lucide-react";

import { EmptyState, NoticeState, PageContainer, PageHeader } from "@/components/app/AppChrome";
import { Button } from "@/components/ui/button";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { openOfflineDb, type OutboxEntry, type OutboxStatus } from "@/lib/offline/db";

export const Route = createFileRoute("/_authenticated/app/sync")({
  head: () => ({ meta: [{ title: "SAVO — Sync & offline" }] }),
  component: SyncPage,
});

const STATUS_COPY: Record<OutboxStatus, { label: string; tone: string }> = {
  pending: { label: "Waiting to sync", tone: "border-border bg-sunken text-muted-foreground" },
  syncing: { label: "Synchronizing", tone: "border-positive/40 bg-positive-soft/60 text-positive" },
  failed: {
    label: "Failed — needs attention",
    tone: "border-negative/40 bg-negative-soft text-negative",
  },
  conflict: { label: "Conflict — review", tone: "border-caution/50 bg-caution-soft text-caution" },
};

/**
 * The offline screen.
 *
 * Everything Part 3.7 asks for, in one place: what the network is doing, when
 * the server last confirmed this shop, how many operations are queued, which
 * ones failed and why, whether cached stock may be stale — and a manual Sync
 * Now. Quiet by design: an offline till that is selling fine must not be
 * shouted at.
 */
function SyncPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";
  const { online, counts, entries, lastSync, syncing, lastReport, syncNow, retry } =
    useOfflineSync(shopId);
  const [storeOk, setStoreOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    openOfflineDb()
      .then(() => !cancelled && setStoreOk(true))
      .catch(() => !cancelled && setStoreOk(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const hasFailures = counts.failed + counts.conflict > 0;
  // The store only ever holds work that has not landed; synced rows are
  // removed the moment the server acknowledges them.
  const queued = entries;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Device"
        title="Sync & offline"
        subtitle="What is saved on this device, and what still needs the server."
        action={
          <Button
            className="h-10"
            onClick={() => void syncNow()}
            disabled={syncing || !online || counts.total === 0}
          >
            {syncing ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />}
            Sync now
          </Button>
        }
      />

      {/* --------------------------------------------------------- status */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-full",
              online ? "bg-positive-soft text-positive" : "bg-caution-soft text-caution",
            )}
          >
            {online ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <WifiOff className="size-4" aria-hidden />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              {online ? "Connected" : "Offline — the till keeps working"}
            </p>
            <p className="text-xs text-muted-foreground">
              {lastSync
                ? `Last synced ${formatDateTime(new Date(lastSync).toISOString())}`
                : "Never synced on this device yet"}
            </p>
          </div>
          <div className="text-right">
            <p className="tnum text-lg font-semibold">{counts.total}</p>
            <p className="text-[11px] leading-tight text-muted-foreground">queued</p>
          </div>
        </div>

        {counts.total > 0 ? (
          <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
            {counts.pending} waiting · {counts.syncing} syncing · {counts.failed} failed ·{" "}
            {counts.conflict} in conflict
          </p>
        ) : null}

        {lastReport ? (
          <p
            className={cn(
              "mt-3 text-xs font-medium",
              lastReport.synced > 0
                ? "text-positive"
                : hasFailures
                  ? "text-negative"
                  : "text-muted-foreground",
            )}
            role="status"
          >
            {lastReport.message}
          </p>
        ) : null}
      </section>

      {/* --------------------------------------------------- local storage */}
      {storeOk === false ? (
        <div className="mt-3">
          <NoticeState
            tone="danger"
            icon={<CloudOff className="size-4" aria-hidden />}
            title="Offline saving is unavailable on this device"
            description="This browser is not allowing local storage, so sales cannot be queued while offline. Work online, or enable site storage and reopen SAVO."
          />
        </div>
      ) : null}

      {online && hasFailures ? (
        <div className="mt-3">
          <NoticeState
            tone="danger"
            icon={<AlertTriangle className="size-4" aria-hidden />}
            title="Some operations need attention"
            description="The server refused these — stock changed elsewhere, or the session needs signing in again. Nothing was lost: each one keeps its reason below."
          />
        </div>
      ) : null}

      {/* -------------------------------------------------------- the queue */}
      <p className="mt-5 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Queued operations
      </p>

      {queued.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          description="Sales made on this device reach the server as they happen. While offline they queue here first, and appear below until they sync."
        />
      ) : (
        <ul className="list-divided overflow-hidden rounded-lg border border-border">
          {queued.map((entry) => (
            <QueueRow
              key={entry.txId}
              entry={entry}
              currency={currency}
              busy={syncing}
              onRetry={() => void retry(entry.txId)}
            />
          ))}
        </ul>
      )}

      {!online ? (
        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <WifiOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            Cached stock on this device may be behind the server until the next successful sync.
            Prices and quantities are re-checked server-side the moment each queued sale is sent.
          </span>
        </p>
      ) : null}

      <p className="mt-5">
        <Button variant="outline" className="w-full" asChild>
          <Link to="/app/pos" search={{ shop: undefined }}>
            Back to the till
          </Link>
        </Button>
      </p>
    </PageContainer>
  );
}

function QueueRow({
  entry,
  currency,
  busy,
  onRetry,
}: {
  entry: OutboxEntry;
  currency: string;
  busy: boolean;
  onRetry: () => void;
}) {
  const status = STATUS_COPY[entry.status];
  const total =
    entry.payload.lines.reduce(
      (sum, line) => sum + line.quantity * line.unitPrice - (line.discountAmount || 0),
      0,
    ) - (entry.payload.discountAmount || 0);

  return (
    <li className="flex items-start gap-3 px-3.5 py-3">
      <span
        className={cn(
          "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full",
          entry.status === "failed" || entry.status === "conflict"
            ? "bg-caution-soft text-caution"
            : "bg-sunken text-muted-foreground",
        )}
      >
        <CloudOff className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium">
            {entry.payload.lines.reduce((sum, line) => sum + line.quantity, 0)} item sale ·{" "}
            <span className="tnum">{formatMoney(total, currency)}</span>
          </p>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
              status.tone,
            )}
          >
            {status.label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatDateTime(new Date(entry.createdAt).toISOString())}
          {entry.attempts > 0
            ? ` · ${entry.attempts} attempt${entry.attempts === 1 ? "" : "s"}`
            : ""}
        </p>
        {entry.lastError ? (
          <p className="mt-1 break-words text-xs leading-relaxed text-negative">
            {entry.lastError}
          </p>
        ) : null}
        {entry.status === "failed" || entry.status === "conflict" ? (
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-8 text-xs"
            disabled={busy}
            onClick={onRetry}
          >
            <RefreshCw aria-hidden /> Try again
          </Button>
        ) : null}
      </div>
    </li>
  );
}
