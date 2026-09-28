/**
 * Stock ledger.
 *
 * Reads are plain queries; every WRITE goes through the `record_stock_movement`
 * RPC so the quantity and its audit row are always written together. Nothing in
 * the UI is allowed to update `products.quantity` directly.
 */
import { supabase } from "@/integrations/supabase/client";
import type { InventoryMovement, MovementType, Product } from "@/types/ravqen";

export interface ListMovementsOptions {
  shopId: string;
  productId?: string | undefined;
  limit?: number;
}

export async function listMovements(options: ListMovementsOptions): Promise<InventoryMovement[]> {
  let query = supabase
    .from("inventory_movements")
    .select(
      "id, shop_id, product_id, movement_type, quantity, unit_cost, balance_after, reference_type, reference_id, notes, user_id, created_at",
    )
    .eq("shop_id", options.shopId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (options.productId) query = query.eq("product_id", options.productId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export interface StockInInput {
  productId: string;
  quantity: number;
  unitCost?: number | null;
  notes?: string | null;
}

/** Restocking: a positive movement, optionally updating the buying price. */
export async function recordStockIn(input: StockInInput): Promise<Product> {
  if (input.quantity <= 0) throw new Error("Enter a quantity above zero.");

  const args: {
    p_product_id: string;
    p_movement_type: MovementType;
    p_quantity: number;
    p_notes?: string;
    p_unit_cost?: number;
  } = {
    p_product_id: input.productId,
    p_movement_type: "stock_in",
    p_quantity: input.quantity,
  };
  if (input.notes) args.p_notes = input.notes;
  if (input.unitCost != null) args.p_unit_cost = input.unitCost;

  const { data, error } = await supabase.rpc("record_stock_movement", args);
  if (error) throw error;
  return data;
}

/** Stock count correction: the shelf is the truth, the difference is recorded. */
export async function recordStockCount(
  productId: string,
  countedQuantity: number,
  notes?: string | null,
): Promise<Product> {
  if (countedQuantity < 0) throw new Error("A counted quantity cannot be negative.");

  const args: {
    p_product_id: string;
    p_movement_type: MovementType;
    p_new_quantity: number;
    p_notes?: string;
  } = {
    p_product_id: productId,
    p_movement_type: "adjustment",
    p_new_quantity: countedQuantity,
  };
  if (notes) args.p_notes = notes;

  const { data, error } = await supabase.rpc("record_stock_movement", args);
  if (error) throw error;
  return data;
}

export async function recordDamage(
  productId: string,
  quantity: number,
  notes?: string | null,
): Promise<Product> {
  if (quantity <= 0) throw new Error("Enter a quantity above zero.");

  const args: {
    p_product_id: string;
    p_movement_type: MovementType;
    p_quantity: number;
    p_notes?: string;
  } = {
    p_product_id: productId,
    p_movement_type: "damage",
    p_quantity: -Math.abs(quantity),
  };
  if (notes) args.p_notes = notes;

  const { data, error } = await supabase.rpc("record_stock_movement", args);
  if (error) throw error;
  return data;
}
