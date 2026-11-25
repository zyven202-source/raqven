/**
 * Commerce features layered on the Marketlink core: order lifecycle,
 * settlement, the inbox, SAVO Circles, reviews and release notes.
 *
 * Everything here goes through a SECURITY DEFINER function. None of these
 * calls reads a table directly, so the rules that matter — who may confirm an
 * order, whose notifications are visible, whose list a share token reveals —
 * are decided in one place the browser cannot skip.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  InboxCounts,
  InboxNotification,
  MarketListPayload,
  MarketListSummary,
  MarketOrderState,
  MarketRelease,
  OrderDocument,
  SettlementState,
  ShopReputation,
  ShopReview,
} from "@/types/marketlink";

// ---------------------------------------------------------------- lifecycle

export async function advanceOrder(
  orderId: string,
  status: MarketOrderState,
  note?: string | null,
): Promise<void> {
  await callRpc("marketlink_advance_order", {
    p_order_id: orderId,
    p_status: status,
    ...(note ? { p_note: note } : {}),
  });
}

export async function confirmSettlement(orderId: string): Promise<SettlementState> {
  return callRpc<SettlementState>("marketlink_confirm_settlement", { p_order_id: orderId });
}

export async function disputeOrder(orderId: string, reason: string): Promise<void> {
  await callRpc("marketlink_dispute_order", { p_order_id: orderId, p_reason: reason });
}

export async function fetchOrderDocument(orderId: string): Promise<OrderDocument> {
  return callRpc<OrderDocument>("marketlink_order_document", { p_order_id: orderId });
}

// -------------------------------------------------------------------- inbox

export async function fetchInbox(limit = 30): Promise<InboxNotification[]> {
  const data = await callRpc<InboxNotification[] | null>("marketlink_notification_feed", {
    p_limit: limit,
  });
  return data ?? [];
}

export async function fetchInboxCounts(): Promise<InboxCounts> {
  const data = await callRpc<InboxCounts | null>("marketlink_inbox_counts");
  return data ?? { notifications: 0, releases: 0 };
}

export async function markNotificationRead(id: string): Promise<void> {
  await callRpc("marketlink_mark_notification_read", { p_id: id });
}

export async function markAllNotificationsRead(): Promise<number> {
  const data = await callRpc<number | null>("marketlink_mark_all_notifications_read");
  return typeof data === "number" ? data : 0;
}

// ----------------------------------------------------------------- releases

export async function fetchReleases(limit = 20): Promise<MarketRelease[]> {
  const data = await callRpc<MarketRelease[] | null>("marketlink_release_feed", { p_limit: limit });
  return data ?? [];
}

export async function markReleaseRead(id: string): Promise<void> {
  await callRpc("marketlink_mark_release_read", { p_release_id: id });
}

// ------------------------------------------------------------------- circles

export async function fetchMyLists(): Promise<MarketListSummary[]> {
  const data = await callRpc<MarketListSummary[] | null>("marketlink_my_lists");
  return data ?? [];
}

/*
 * These functions are declared after the migration that adds them, so the
 * generated Supabase types (which are rebuilt from the live schema) do not know
 * them yet. The single cast below is narrowed to "an RPC call returning JSON"
 * — no table handle is ever taken, so nothing here can bypass RLS or reach a
 * column the function does not return.
 */
type RpcResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => RpcResult;

async function callRpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function createList(name: string): Promise<string> {
  return callRpc<string>("marketlink_create_list", { p_name: name.trim() });
}

export async function renameList(id: string, name: string): Promise<void> {
  await callRpc("marketlink_rename_list", { p_list_id: id, p_name: name.trim() });
}

export async function deleteList(id: string): Promise<void> {
  await callRpc("marketlink_delete_list", { p_list_id: id });
}

export async function rotateShareToken(id: string): Promise<void> {
  await callRpc("marketlink_rotate_list_share", { p_list_id: id });
}

export async function setShareEnabled(id: string, enabled: boolean): Promise<void> {
  await callRpc("marketlink_set_list_share", { p_list_id: id, p_enabled: enabled });
}

export async function fetchListPayload(
  listId: string | null,
  token: string | null,
): Promise<MarketListPayload> {
  return callRpc<MarketListPayload>("marketlink_list_payload", {
    p_list_id: listId,
    p_token: token,
  });
}

export async function addListItem(input: {
  listId: string;
  name: string;
  quantity?: number;
  listingId?: string | null;
  productId?: string | null;
  note?: string | null;
}): Promise<void> {
  await callRpc("marketlink_add_list_item", {
    p_list_id: input.listId,
    p_name: input.name.trim(),
    p_quantity: input.quantity ?? 1,
    p_listing_id: input.listingId ?? null,
    p_product_id: input.productId ?? null,
    p_note: input.note?.trim() || null,
  });
}

export async function updateListItem(
  id: string,
  patch: { quantity?: number; resolved?: boolean; name?: string; note?: string | null },
): Promise<void> {
  await callRpc("marketlink_update_list_item", {
    p_item_id: id,
    p_quantity: patch.quantity ?? null,
    p_resolved: patch.resolved ?? null,
    p_name: patch.name ?? null,
    p_note: patch.note ?? null,
  });
}

export async function removeListItem(id: string): Promise<void> {
  await callRpc("marketlink_remove_list_item", { p_item_id: id });
}

// ------------------------------------------------------------------- reviews

export async function submitReview(
  orderId: string,
  rating: number,
  body: string | null,
): Promise<string | null> {
  const review = await callRpc<{ id?: string } | null>("marketlink_submit_review", {
    p_order_id: orderId,
    p_rating: rating,
    ...(body ? { p_body: body } : {}),
  });
  return review?.id ?? null;
}

/**
 * Asks SAVO AI to label a review that was just submitted.
 *
 * Deliberately fire-and-forget: the review is already saved, and the label is an
 * extra. If the model, the quota or the network is unavailable, the seller's
 * feedback section still works and labels the review on its next visit. When it
 * does succeed, the label is stored on the row, so the seller's first open reads
 * it instead of waiting for a model response.
 */
export async function labelSubmittedReview(reviewId: string): Promise<void> {
  try {
    await supabase.functions.invoke("savo-ai", {
      body: { action: "sentiment", reviewId },
    });
  } catch {
    /* The label is optional; the review is already saved. */
  }
}

export async function reportReview(reviewId: string, reason: string | null): Promise<void> {
  await callRpc("marketlink_report_review", {
    p_review_id: reviewId,
    ...(reason ? { p_reason: reason } : {}),
  });
}

export async function fetchShopReputation(slug: string): Promise<ShopReputation> {
  const data = await callRpc<ShopReputation | null>("marketlink_shop_reputation", { p_slug: slug });
  return data ?? { average: 0, count: 0, verified_count: 0, five_star: 0 };
}

export async function fetchShopReviews(slug: string): Promise<ShopReview[]> {
  const data = await callRpc<ShopReview[] | null>("marketlink_shop_reviews", { p_slug: slug });
  return data ?? [];
}

/** Rich text is stored as JSON, but a list of strings is what the UI shows. */
export function textList(value: Json | null): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}
