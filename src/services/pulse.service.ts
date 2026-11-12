/**
 * Pith Pulse — data access.
 *
 * Every read here is scoped to one shop and rides the same row-level security
 * as the rest of Pith: the queries name `shop_id` so PostgREST has an index to
 * use, but the database is what refuses a shop the signed-in member does not
 * belong to. The headline aggregates reuse `shop_report` — the owner-only
 * function the Reports screen already uses — so Pulse and Reports cannot
 * disagree, and an employee is refused by the backend, not by hidden UI.
 *
 * Windows are bounded (see `MAX_WINDOW_DAYS`), columns are listed rather than
 * selected with `*`, and every call accepts the query's AbortSignal so a
 * period switch cancels the previous window's fetch instead of racing it.
 */
import { supabase } from "@/integrations/supabase/client";
import type { SaleLine } from "@/lib/pulse/metrics";
import { getShopReport, type ShopReport } from "@/services/reports.service";

/** Owner-only aggregate for one window. Same function Reports reads. */
export function getPulseReport(
  shopId: string,
  from: Date,
  to: Date,
  signal?: AbortSignal,
): Promise<ShopReport> {
  return getShopReport(shopId, from, to, signal);
}

/**
 * Every sale line inside a window, with the sale's timestamp.
 *
 * The embedded `sales!inner` filter moves the date bounds onto `sales.sold_at`
 * (which has the `(shop_id, sold_at)` index) while the row filter on
 * `sale_items.shop_id` keeps the tenancy predicate explicit. Lines are the
 * grain the radar and the product rankings need; the overview totals do not
 * come from here — they come from `shop_report`, computed in PostgreSQL.
 */
export async function listSaleLines(
  shopId: string,
  from: Date,
  to: Date,
  signal?: AbortSignal,
): Promise<SaleLine[]> {
  let query = supabase
    .from("sale_items")
    .select(
      "quantity, subtotal, discount_amount, buying_price, product_id, product_name, sales!inner(sold_at)",
    )
    .eq("shop_id", shopId)
    .gte("sales.sold_at", from.toISOString())
    .lt("sales.sold_at", to.toISOString());
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    soldAt: (row.sales as { sold_at: string }).sold_at,
    productId: row.product_id,
    productName: row.product_name,
    quantity: Number(row.quantity),
    subtotal: Number(row.subtotal),
    buyingPrice: Number(row.buying_price),
  }));
}

/** Expense rows for a window — category, amount and time, and nothing else. */
export async function listExpenseRows(
  shopId: string,
  from: Date,
  to: Date,
  signal?: AbortSignal,
): Promise<{ category: string; amount: number; spentAt: string }[]> {
  let query = supabase
    .from("expenses")
    .select("category, amount, spent_at")
    .eq("shop_id", shopId)
    .gte("spent_at", from.toISOString())
    .lt("spent_at", to.toISOString());
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    category: row.category,
    amount: Number(row.amount),
    spentAt: row.spent_at,
  }));
}

/** The active products the radar reasons over, with their configured thresholds. */
export async function listPulseProducts(
  shopId: string,
  signal?: AbortSignal,
): Promise<
  {
    id: string;
    name: string;
    unit: string;
    stock: number;
    buyingPrice: number;
    sellingPrice: number;
    threshold: number;
    createdAt: string;
  }[]
> {
  let query = supabase
    .from("products")
    .select(
      "id, name, unit, quantity, buying_price, selling_price, low_stock_threshold, created_at",
    )
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .limit(500);
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    unit: row.unit,
    stock: Number(row.quantity),
    buyingPrice: Number(row.buying_price),
    sellingPrice: Number(row.selling_price),
    threshold: Number(row.low_stock_threshold),
    createdAt: row.created_at,
  }));
}

/** The shop's earliest recorded sale — bounds how long demand can be observed. */
export async function firstSaleAt(shopId: string, signal?: AbortSignal): Promise<string | null> {
  let query = supabase
    .from("sales")
    .select("sold_at")
    .eq("shop_id", shopId)
    .order("sold_at", { ascending: true })
    .limit(1);
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;
  if (error) throw error;
  return data?.[0]?.sold_at ?? null;
}
