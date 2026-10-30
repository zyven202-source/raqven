/**
 * The offline/sync state the shell, the indicator and the sync screen read.
 *
 * One hook instance is enough (it lives in the app shell): it watches the
 * outbox, the clock of the last successful sync, and the network — then
 * answers the three questions the interface keeps asking:
 *
 *   • how many operations are waiting?
 *   • when did the server last confirm this shop?
 *   • should we try again now?
 *
 * Triggers follow the spec: on mount (startup), when connectivity returns,
 * when the queue changes (the POS just enqueued something), and on demand via
 * `syncNow`. Background sync is deliberately not relied on — a browser that
 * closed the tab may never run it, so the queue works without it.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { outboxCounts, listOutbox, patchOutbox, type OutboxEntry } from "@/lib/offline/db";
import { probeReachable, syncShop, lastSyncAt, type SyncReport } from "@/lib/offline/sync";

/** Fired (on window) whenever the outbox changes outside this hook. */
export const OUTBOX_CHANGED_EVENT = "savo:outbox-changed";

export interface OfflineCounts {
  pending: number;
  syncing: number;
  failed: number;
  conflict: number;
  total: number;
}

const EMPTY: OfflineCounts = { pending: 0, syncing: 0, failed: 0, conflict: 0, total: 0 };

export function useOfflineSync(shopId: string) {
  const [online, setOnline] = useState(true);
  const [counts, setCounts] = useState<OfflineCounts>(EMPTY);
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastReport, setLastReport] = useState<SyncReport | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (!shopId) return;
    try {
      const [nextCounts, rows, syncedAt] = await Promise.all([
        outboxCounts(shopId),
        listOutbox(shopId),
        lastSyncAt(shopId),
      ]);
      setCounts(nextCounts);
      setEntries(rows);
      setLastSync(syncedAt);
    } catch {
      // Local storage unavailable: the UI shows zero queued work rather than
      // lying about a queue it cannot see. The sync screen surfaces the fact
      // that offline saving is unavailable on this device.
      setCounts(EMPTY);
      setEntries([]);
    }
  }, [shopId]);

  const syncNow = useCallback(async (): Promise<SyncReport | null> => {
    if (!shopId || busy.current) return null;
    busy.current = true;
    setSyncing(true);
    try {
      const reachable = await probeReachable();
      setOnline(reachable);
      if (!reachable) {
        const report: SyncReport = {
          reached: false,
          attempted: 0,
          synced: 0,
          failed: 0,
          conflicts: 0,
          remaining: counts.total,
          message: "Still offline — nothing was sent.",
        };
        setLastReport(report);
        return report;
      }
      const report = await syncShop(shopId);
      setLastReport(report);
      return report;
    } finally {
      busy.current = false;
      setSyncing(false);
      await refresh();
    }
  }, [shopId, counts.total, refresh]);

  /**
   * The conflict/failure resolution path: put one operation back in line and
   * try it again. An entry that the server refused is never retried
   * automatically — a stock conflict is a person's decision, not a loop's.
   */
  const retry = useCallback(
    async (txId: string): Promise<SyncReport | null> => {
      await patchOutbox(txId, { status: "pending", lastError: null }).catch(() => {});
      await refresh();
      return syncNow();
    },
    [refresh, syncNow],
  );

  // Startup + every queue change + every return to connectivity.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!shopId) return;
    let disposed = false;

    const trySync = () => {
      if (disposed) return;
      void syncNow();
    };

    const onQueueChanged = () => {
      void refresh();
      trySync();
    };

    // A backgrounded PWA often misses the `online` event entirely, so a
    // return to the foreground is treated as an equally good moment to try.
    const onVisible = () => {
      if (document.visibilityState === "visible") void syncNow();
    };

    window.addEventListener("online", trySync);
    window.addEventListener(OUTBOX_CHANGED_EVENT, onQueueChanged);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", trySync);
    void syncNow(); // startup sync

    return () => {
      disposed = true;
      window.removeEventListener("online", trySync);
      window.removeEventListener(OUTBOX_CHANGED_EVENT, onQueueChanged);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", trySync);
    };
    // syncNow is stable per shop; re-running it on identity churn would mean
    // a sync loop, so it is deliberately not in the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shopId]);

  // Connectivity visibility for the pill, without re-running sync.
  useEffect(() => {
    let disposed = false;
    const probe = () => {
      void probeReachable().then((ok) => {
        if (!disposed) setOnline(ok);
      });
    };
    const onOnline = () => probe();
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void probe();
    return () => {
      disposed = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return {
    online,
    counts,
    entries,
    lastSync,
    syncing,
    lastReport,
    refresh,
    syncNow,
    retry,
  };
}
