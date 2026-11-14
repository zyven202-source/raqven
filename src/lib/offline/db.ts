/**
 * SAVO's local database — IndexedDB, one versioned schema.
 *
 * This is durable storage for records the server has not acknowledged yet and
 * for the catalogue the till needs to keep selling when the network is gone.
 * It is deliberately NOT localStorage: localStorage is synchronous string
 * storage meant for UI preferences (which shop tab is open, say), and a
 * financial record deserves a real database with transactions, typed stores
 * and an upgrade path.
 *
 * Three stores:
 *
 *   - `outbox`   — operations waiting to reach the server, keyed by their
 *                  own UUID (`txId`), which is also the idempotency key the
 *                  server dedupes retries by (`p_client_tx_id`).
 *   - `products` — this shop's last confirmed catalogue, so an offline till
 *                  can search stock. Authoritative quantities live on the
 *                  server; anything read from here is an estimate and the UI
 *                  says so.
 *   - `meta`     — small facts: the workspace snapshot, the last successful
 *                  sync time per shop, queue markers.
 *
 * Every schema change bumps SCHEMA_VERSION and adds an upgrade step — never
 * drop a store without migrating what it held.
 */
import type { PaymentMethod } from "@/types/savo";

const DB_NAME = "savo-offline";
export const SCHEMA_VERSION = 1;

const OUTBOX = "outbox";
const PRODUCTS = "products";
const META = "meta";

/** How an operation is tracked while it waits for (or survives) the server. */
export type OutboxStatus = "pending" | "syncing" | "failed" | "conflict";

/** The replayable cart — exactly what `createSale` needs, nothing more. */
export interface OutboxSalePayload {
  shopId: string;
  lines: { productId: string; quantity: number; unitPrice: number; discountAmount: number }[];
  paymentMethod: PaymentMethod;
  amountTendered: number;
  discountAmount: number;
  debtorName: string | null;
  debtorPhone: string | null;
  note: string | null;
}

/** One operation waiting to reach the server. */
export interface OutboxEntry {
  /** UUID — the operation's identity, and what the server dedupes on. */
  txId: string;
  shopId: string;
  /** The auth user who made it, when a session existed at enqueue time. */
  userId: string | null;
  opType: "sale";
  payload: OutboxSalePayload;
  createdAt: number;
  status: OutboxStatus;
  attempts: number;
  lastError: string | null;
  updatedAt: number;
}

/** The slice of a product row the till renders, from either source. */
export interface CachedProduct {
  id: string;
  shopId: string;
  name: string;
  barcode: string | null;
  sku: string | null;
  unit: string;
  buying_price: number;
  selling_price: number;
  /** Estimated while offline — the server re-validates on every queued sale. */
  quantity: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  is_active: boolean;
  cachedAt: number;
}

export interface OutboxCounts {
  pending: number;
  syncing: number;
  failed: number;
  conflict: number;
  total: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function upgrade(db: IDBDatabase, tx: IDBTransaction | null): void {
  // Stores are created on the database (a versionchange transaction can only
  // *open* stores that already exist — asking it for a missing one throws and
  // aborts the whole upgrade).
  if (!db.objectStoreNames.contains(OUTBOX)) {
    const outbox = db.createObjectStore(OUTBOX, { keyPath: "txId" });
    outbox.createIndex("shopId", "shopId", { unique: false });
    outbox.createIndex("status", "status", { unique: false });
    outbox.createIndex("createdAt", "createdAt", { unique: false });
  }
  if (!db.objectStoreNames.contains(PRODUCTS)) {
    const products = db.createObjectStore(PRODUCTS, { keyPath: "id" });
    products.createIndex("shopId", "shopId", { unique: false });
  }
  if (!db.objectStoreNames.contains(META)) {
    db.createObjectStore(META, { keyPath: "key" });
  }
  void tx;
}

/** Open (and upgrade) the local database. Callers surface its failure. */
export function openOfflineDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const request = indexedDB.open(DB_NAME, SCHEMA_VERSION);
    request.onupgradeneeded = () => upgrade(request.result, request.transaction);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open the local database."));
    request.onblocked = () => reject(new Error("The local database is blocked by another tab."));
  });
  // A failed open must not poison the cache — the next caller retries.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Local database transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Local database transaction aborted."));
  });
}

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local database request failed."));
  });
}

/* ------------------------------------------------------------------ outbox */

export async function putOutbox(entry: OutboxEntry): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(OUTBOX, "readwrite");
  tx.objectStore(OUTBOX).put(entry);
  await done(tx);
}

export async function patchOutbox(
  txId: string,
  patch: Partial<Omit<OutboxEntry, "txId">>,
): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(OUTBOX, "readwrite");
  const store = tx.objectStore(OUTBOX);
  const current = await req<OutboxEntry | undefined>(store.get(txId));
  if (current) store.put({ ...current, ...patch, txId, updatedAt: Date.now() });
  await done(tx);
}

export async function removeOutbox(txId: string): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(OUTBOX, "readwrite");
  tx.objectStore(OUTBOX).delete(txId);
  await done(tx);
}

export async function listOutbox(shopId: string): Promise<OutboxEntry[]> {
  const db = await openOfflineDb();
  const tx = db.transaction(OUTBOX, "readonly");
  const rows = await req<OutboxEntry[]>(tx.objectStore(OUTBOX).index("shopId").getAll(shopId));
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

export async function outboxCounts(shopId: string): Promise<OutboxCounts> {
  const rows = await listOutbox(shopId);
  const counts: OutboxCounts = {
    pending: 0,
    syncing: 0,
    failed: 0,
    conflict: 0,
    total: rows.length,
  };
  for (const row of rows) counts[row.status] += 1;
  return counts;
}

/* --------------------------------------------------- local stock estimate */

/**
 * Adjusts the device's stock estimate after an offline sale.
 *
 * An estimate only: the server recomputes real stock when the queued sale is
 * replayed, and every online read overwrites this mirror anyway. A delta is
 * applied rather than an absolute quantity so a concurrent offline sale
 * cannot resurrect stock the projection already spent.
 */
export async function applyLocalStockDelta(
  shopId: string,
  deltas: { productId: string; delta: number }[],
): Promise<void> {
  if (deltas.length === 0) return;
  const db = await openOfflineDb();
  const tx = db.transaction(PRODUCTS, "readwrite");
  const store = tx.objectStore(PRODUCTS);
  for (const { productId, delta } of deltas) {
    const current = await req<CachedProduct | undefined>(store.get(productId));
    if (current && current.shopId === shopId) {
      store.put({ ...current, quantity: current.quantity + delta, cachedAt: Date.now() });
    }
  }
  await done(tx);
}

/* -------------------------------------------------------- product mirror */

/** The shop's last confirmed catalogue, sorted like the server returns it. */
export async function listCachedProducts(shopId: string): Promise<CachedProduct[]> {
  const db = await openOfflineDb();
  const tx = db.transaction(PRODUCTS, "readonly");
  const rows = await req<CachedProduct[]>(tx.objectStore(PRODUCTS).index("shopId").getAll(shopId));
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Replaces the shop's mirror after a successful fetch — the mirror is a
 * snapshot of the last server answer, so it is swapped wholesale rather than
 * merged (a merge could keep a product the server just archived).
 */
export async function replaceShopProducts(
  shopId: string,
  products: Omit<CachedProduct, "cachedAt" | "shopId">[],
): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(PRODUCTS, "readwrite");
  const store = tx.objectStore(PRODUCTS);
  const index = store.index("shopId");
  const existing = await req<IDBValidKey[]>(index.getAllKeys(shopId));
  const at = Date.now();
  for (const key of existing) store.delete(key);
  for (const product of products) store.put({ ...product, shopId, cachedAt: at });
  await done(tx);
}

/* -------------------------------------------------------------------- meta */

export async function getMeta<T>(key: string): Promise<T | null> {
  const db = await openOfflineDb();
  const tx = db.transaction(META, "readonly");
  const row = await req<{ key: string; value: unknown } | undefined>(tx.objectStore(META).get(key));
  return (row?.value as T | undefined) ?? null;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  const db = await openOfflineDb();
  const tx = db.transaction(META, "readwrite");
  tx.objectStore(META).put({ key, value });
  await done(tx);
}

/** True when this browser exposes IndexedDB we can actually open. */
export function localDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}
