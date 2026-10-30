/**
 * The sync engine — drains this shop's outbox when the network and the
 * session allow.
 *
 * The order mirrors the offline plan exactly:
 *
 *   1. reachability first (no point touching auth offline),
 *   2. then a validated session — a queued sale must not be attempted as an
 *      anonymous caller and then blamed on the server,
 *   3. then upload oldest-first, one operation at a time,
 *   4. every attempt is server-validated (`create_sale` re-checks stock,
 *      prices and permissions inside one transaction),
 *   5. deduplication is by operation id — the same UUID replays as the same
 *      sale, so a retry can never double-record,
 *   6. a local record is deleted only after the server's acknowledgement,
 *      never optimistically,
 *   7. a definitive server rejection (stock gone, validation, permission)
 *      lands in `failed`/`conflict` WITH its message and is NOT retried
 *      automatically — a stock conflict is a person's decision, not a loop's,
 *   8. an interrupted connection stops the loop and leaves the operation
 *      `pending` — not failed, because nothing proved the operation bad.
 *
 * Triggers live in `useOfflineSync`: startup, the `online` event, returning
 * to the foreground, and the manual Sync Now button. Background Sync is
 * deliberately not relied on: a browser may never run it, and a till that
 * assumes it ran lies about its own queue.
 */
import { supabase } from "@/integrations/supabase/client";
import { listOutbox, patchOutbox, removeOutbox, setMeta, type OutboxEntry } from "@/lib/offline/db";
import { createSale, type CreateSaleInput } from "@/services/sales.service";

export interface SyncReport {
  /** The backend answered at all — the probe saw a response. */
  reached: boolean;
  attempted: number;
  synced: number;
  failed: number;
  conflicts: number;
  remaining: number;
  message: string;
}

/**
 * Can this device reach the backend right now?
 *
 * A REST call with the anon key: any HTTP answer — 200, 401, 404 — proves
 * reachability, and only a thrown network error proves the opposite. RLS
 * means the response itself carries nothing beyond that.
 */
export async function probeReachable(): Promise<boolean> {
  try {
    const { error } = await supabase.from("shops").select("id", { head: true, count: "exact" });
    if (error) {
      // PostgREST answered with an error — that is still "reachable"; only a
      // transport failure means the network is gone.
      const message = error.message ?? "";
      if (/failed to fetch|networkerror|load failed|fetch failed/i.test(message)) return false;
      return true;
    }
    return true;
  } catch {
    return false;
  }
}

type Verdict = "network" | "auth" | "conflict" | "server";

function classify(error: unknown): { kind: Verdict; message: string } {
  // The RPC error arrives as a plain `{ code, message }` object rather than
  // an Error instance in this client version — reading `message` explicitly
  // is the difference between "Insufficient stock for Maziwa" and
  // "[object Object]" on the review screen.
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: unknown } | null)?.message ?? error);
  const code = String((error as { code?: unknown })?.code ?? "");
  if (
    /failed to fetch|networkerror|load failed|fetch failed|network request failed/i.test(message)
  ) {
    return { kind: "network", message: "The connection dropped before the server answered." };
  }
  if (code === "401" || code === "42501" || /not authenticated|jwt|session/i.test(message)) {
    return { kind: "auth", message: "Signed out — sign in again to retry." };
  }
  // Conflicts are the specific, reviewable cases: stock that moved under the
  // device, a product that left the shop, or the same operation id landing
  // twice through a race. A bare `raise_exception` (P0001) with any other
  // message — the receipt prefix being invalid, say — is a server refusal to
  // fix, not a stock conflict, and must not be labelled as one.
  if (/insufficient stock/i.test(message)) {
    return { kind: "conflict", message };
  }
  if (code === "P0002" || /not found in this shop/i.test(message)) {
    return { kind: "conflict", message };
  }
  if (code === "23505" || /duplicate key/i.test(message)) {
    return { kind: "conflict", message: `Already recorded elsewhere: ${message}` };
  }
  return { kind: "server", message };
}

const lastSyncKey = (shopId: string) => `lastSync:${shopId}`;
const queueKey = (shopId: string) => `queue:${shopId}`;

/** When the server last acknowledged anything for this shop. */
export async function lastSyncAt(shopId: string): Promise<number | null> {
  try {
    const { getMeta } = await import("@/lib/offline/db");
    const value = await getMeta<number>(lastSyncKey(shopId));
    return typeof value === "number" ? value : null;
  } catch {
    return null;
  }
}

async function markSynced(shopId: string, synced: number): Promise<void> {
  await setMeta(lastSyncKey(shopId), Date.now());
  if (synced > 0) {
    // Drop the "not empty" marker the moment the shop's queue drains.
    const remaining = await listOutbox(shopId);
    if (remaining.length === 0) await setMeta(queueKey(shopId), null);
  }
}

export async function syncShop(shopId: string): Promise<SyncReport> {
  const base = { attempted: 0, synced: 0, failed: 0, conflicts: 0, remaining: 0 };

  if (!shopId) {
    return { ...base, reached: false, message: "No shop selected." };
  }

  const reachable = await probeReachable();
  if (!reachable) {
    const queued = await listOutbox(shopId);
    return {
      ...base,
      reached: false,
      remaining: queued.length,
      message: "Still offline — nothing was sent.",
    };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    const queued = await listOutbox(shopId);
    return {
      ...base,
      reached: true,
      remaining: queued.length,
      message: "No active session — sign in to sync.",
    };
  }

  // Rows left mid-flight by a closed tab are pending like any other: the
  // server has not acknowledged them either way.
  const queued = await listOutbox(shopId);
  for (const stuck of queued.filter((row) => row.status === "syncing")) {
    await patchOutbox(stuck.txId, { status: "pending" });
  }

  const queue = (await listOutbox(shopId)).filter((row) => row.status === "pending");

  let attempted = 0;
  let synced = 0;
  let failed = 0;
  let conflicts = 0;
  let stopped: string | null = null;

  for (const entry of queue) {
    if (!(await probeReachable())) {
      stopped = "The connection dropped mid-sync.";
      break;
    }
    attempted += 1;
    await patchOutbox(entry.txId, { status: "syncing" });

    try {
      await deliver(entry);
      await removeOutbox(entry.txId);
      synced += 1;
    } catch (error) {
      const verdict = classify(error);
      if (verdict.kind === "network") {
        await patchOutbox(entry.txId, { status: "pending" });
        stopped = verdict.message;
        break;
      }
      if (verdict.kind === "auth") {
        await patchOutbox(entry.txId, {
          status: "failed",
          attempts: entry.attempts + 1,
          lastError: verdict.message,
        });
        stopped = verdict.message;
        break;
      }
      await patchOutbox(entry.txId, {
        status: verdict.kind === "conflict" ? "conflict" : "failed",
        attempts: entry.attempts + 1,
        lastError: verdict.message,
      });
      if (verdict.kind === "conflict") conflicts += 1;
      else failed += 1;
    }
  }

  if (synced > 0) await markSynced(shopId, synced);
  else if (attempted === 0 && stopped === null && failed === 0 && conflicts === 0) {
    // An empty queue that reached the server proves connectivity too — that
    // is what makes "last synced" honest for a shop with nothing queued.
    await markSynced(shopId, 0);
  }

  const remaining = (await listOutbox(shopId)).length;
  const rejected = failed + conflicts;

  let message: string;
  if (stopped) message = stopped;
  else if (rejected > 0) {
    message = `${rejected} operation${rejected === 1 ? "" : "s"} refused by the server — open the list below for the reason.`;
  } else if (synced > 0) {
    message = `${synced} operation${synced === 1 ? "" : "s"} synced.`;
  } else {
    message = "Everything is up to date.";
  }

  return { reached: true, attempted, synced, failed, conflicts, remaining, message };
}

/** Replays one queued operation. The operation's id IS the idempotency key. */
async function deliver(entry: OutboxEntry): Promise<void> {
  const payload = entry.payload;
  const input: CreateSaleInput = {
    shopId: payload.shopId,
    lines: payload.lines.map((line) => ({ ...line })),
    paymentMethod: payload.paymentMethod,
    amountTendered: payload.amountTendered,
    discountAmount: payload.discountAmount,
    debtorName: payload.debtorName,
    debtorPhone: payload.debtorPhone,
    note: payload.note,
    clientTxId: entry.txId,
  };
  await createSale(input);
}
