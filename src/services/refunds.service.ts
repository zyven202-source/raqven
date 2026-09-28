/**
 * Refunds.
 *
 * The shop's `accepts_refunds` switch is enforced inside the database function
 * and inside the RLS policy. The UI hides the refund controls when the switch
 * is off, but that is a courtesy — a direct API call is refused too.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Refund, RefundItem } from "@/types/ravqen";

export async function listRefunds(shopId: string, limit = 100): Promise<Refund[]> {
  const { data, error } = await supabase
    .from("refunds")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listRefundItems(shopId: string, limit = 200): Promise<RefundItem[]> {
  const { data, error } = await supabase
    .from("refund_items")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/**
 * How much of each sale line has already been refunded.
 * Keyed by `sale_item_id` so the refund screen can cap each quantity.
 */
export async function refundedQuantities(saleId: string): Promise<Record<string, number>> {
  const { data: refunds, error: refundError } = await supabase
    .from("refunds")
    .select("id, status")
    .eq("sale_id", saleId)
    .neq("status", "rejected");
  if (refundError) throw refundError;

  const ids = (refunds ?? []).map((row) => row.id);
  if (ids.length === 0) return {};

  const { data: items, error: itemError } = await supabase
    .from("refund_items")
    .select("sale_item_id, quantity")
    .in("refund_id", ids);
  if (itemError) throw itemError;

  return (items ?? []).reduce<Record<string, number>>((acc, row) => {
    if (!row.sale_item_id) return acc;
    acc[row.sale_item_id] = (acc[row.sale_item_id] ?? 0) + Number(row.quantity);
    return acc;
  }, {});
}

export interface RefundLineInput {
  saleItemId: string;
  quantity: number;
  /** Put the goods back on the shelf (default true). */
  restock?: boolean;
}

export interface CreateRefundInput {
  saleId: string;
  lines: RefundLineInput[];
  reason?: string | null;
}

export interface CreateRefundResult {
  refundId: string;
  totalAmount: number;
  receiptNumber: string;
}

export async function createRefund(input: CreateRefundInput): Promise<CreateRefundResult> {
  if (input.lines.length === 0) throw new Error("Choose at least one item to refund.");

  const args: {
    p_sale_id: string;
    p_items: { sale_item_id: string; quantity: number; restock: boolean }[];
    p_reason?: string;
  } = {
    p_sale_id: input.saleId,
    p_items: input.lines.map((line) => ({
      sale_item_id: line.saleItemId,
      quantity: line.quantity,
      restock: line.restock ?? true,
    })),
  };
  if (input.reason) args.p_reason = input.reason;

  const { data, error } = await supabase.rpc("create_refund", args);
  if (error) throw error;

  const result = data as unknown as {
    refund_id: string;
    total_amount: number;
    receipt_number: string;
  };

  return {
    refundId: result.refund_id,
    totalAmount: Number(result.total_amount),
    receiptNumber: result.receipt_number,
  };
}
