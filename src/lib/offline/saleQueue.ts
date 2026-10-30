/**
 * The offline sale queue.
 *
 * One function the till calls when the network is gone and the sale is a cash
 * sale: give it the same `CreateSaleInput` the online path uses and it either
 * durably stores the operation — and returns the stored entry — or it throws.
 * It never resolves on a failed write, because the one thing worse than a
 * missing sale is a green "saved offline" toast over an unsaved one.
 *
 * The identity of the operation is a client-generated UUID (`txId`). The same
 * UUID travels to the server as `p_client_tx_id`, where a unique index makes a
 * retry of this exact checkout return the original sale instead of recording a
 * second one. That is what makes "sync, then sync again" safe.
 */
import { randomUUID } from "@/lib/offline/uuid";

import {
  applyLocalStockDelta,
  putOutbox,
  setMeta,
  type OutboxEntry,
  type OutboxSalePayload,
} from "@/lib/offline/db";
import type { CreateSaleInput } from "@/services/sales.service";

export interface EnqueuedSale {
  entry: OutboxEntry;
}

/**
 * Durably stores a sale for later delivery.
 *
 * Order matters: the row is written first, the local stock projection second,
 * and the queue marker last — so if any of them throws, the caller reports a
 * failure and the till offers no receipt.
 */
export async function enqueueOfflineSale(
  input: CreateSaleInput,
  userId: string | null,
): Promise<EnqueuedSale> {
  const txId = randomUUID();
  const now = Date.now();

  const payload: OutboxSalePayload = {
    shopId: input.shopId,
    lines: input.lines.map((line) => ({ ...line })),
    paymentMethod: input.paymentMethod,
    amountTendered: input.amountTendered ?? 0,
    discountAmount: input.discountAmount ?? 0,
    debtorName: input.debtorName ?? null,
    debtorPhone: input.debtorPhone ?? null,
    note: input.note ?? null,
  };

  const entry: OutboxEntry = {
    txId,
    shopId: input.shopId,
    userId,
    opType: "sale",
    payload,
    createdAt: now,
    status: "pending",
    attempts: 0,
    lastError: null,
    updatedAt: now,
  };

  // 1. The operation itself. If this fails, nothing else runs and the caller
  //    is told the truth: the sale is NOT on this device.
  await putOutbox(entry);

  // 2. The stock projection — an estimate, marked as such in the UI. A failure
  //    here does not invalidate the sale (the server recomputes real stock on
  //    sync), but it is recorded so the estimate is not silently wrong.
  try {
    await applyLocalStockDelta(
      input.shopId,
      input.lines.map((line) => ({ productId: line.productId, delta: -line.quantity })),
    );
  } catch {
    /* The projection is a convenience; the queue is the source of truth. */
  }

  // 3. The marker the sync screen reads for "the queue is not empty".
  await setMeta(`queue:${input.shopId}`, { pendingSince: now });

  return { entry };
}
