/**
 * Owner reports.
 *
 * The aggregation runs in PostgreSQL inside `shop_report`, which re-checks
 * ownership itself. An employee calling this gets a permission error from the
 * database — the report is not merely hidden in the UI.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ShopReport {
  salesCount: number;
  grossSales: number;
  discounts: number;
  collected: number;
  debtCollected: number;
  refunds: number;
  expenses: number;
  costOfGoods: number;
  outstandingCredit: number;
  stockValue: number;
  lowStockCount: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
}

/** Start of today, in local time — the day a shopkeeper means by "today". */
export function startOfDay(date = new Date()) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function startOfMonth(date = new Date()) {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export async function getShopReport(shopId: string, from: Date, to: Date): Promise<ShopReport> {
  const { data, error } = await supabase.rpc("shop_report", {
    p_shop_id: shopId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw error;

  const raw = data as unknown as Record<string, unknown>;
  const top = Array.isArray(raw["top_products"]) ? raw["top_products"] : [];

  return {
    salesCount: Number(raw["sales_count"] ?? 0),
    grossSales: Number(raw["gross_sales"] ?? 0),
    discounts: Number(raw["discounts"] ?? 0),
    collected: Number(raw["collected"] ?? 0),
    debtCollected: Number(raw["debt_collected"] ?? 0),
    refunds: Number(raw["refunds"] ?? 0),
    expenses: Number(raw["expenses"] ?? 0),
    costOfGoods: Number(raw["cost_of_goods"] ?? 0),
    outstandingCredit: Number(raw["outstanding_credit"] ?? 0),
    stockValue: Number(raw["stock_value"] ?? 0),
    lowStockCount: Number(raw["low_stock_count"] ?? 0),
    topProducts: (top as { name: string; quantity: unknown; revenue: unknown }[]).map((row) => ({
      name: row.name,
      quantity: Number(row.quantity),
      revenue: Number(row.revenue),
    })),
  };
}
