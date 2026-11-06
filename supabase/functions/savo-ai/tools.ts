/**
 * Read-only business tools.
 *
 * Every query runs through the caller's own Supabase client, so row-level
 * security applies exactly as it does in the app — this layer cannot widen
 * access, only narrow it. The shop is resolved from verified membership before
 * any tool runs and is injected here; the model never supplies a shop id.
 *
 * There are no writes in this file. Not "no destructive writes" — no writes at
 * all, and no tool that could cause one.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

import { HttpError } from "./http.ts";

export type ShopRole = "owner" | "employee";

export interface ToolContext {
  supabase: SupabaseClient;
  shopId: string | null;
  role: ShopRole | null;
  currency: string;
  shopName: string | null;
}

export type ToolResult = Record<string, unknown>;

/** Kenya has no daylight saving, so a fixed offset is correct all year. */
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000;

function nairobiNow(): Date {
  return new Date(Date.now() + NAIROBI_OFFSET_MS);
}

function nairobiDayStart(daysAgo: number): Date {
  const shifted = nairobiNow();
  const localMidnight = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - daysAgo,
  );
  return new Date(localMidnight - NAIROBI_OFFSET_MS);
}

export type Period = "today" | "7d" | "30d" | "90d" | "month" | "year";

const PERIOD_DAYS: Record<Exclude<Period, "month" | "year">, number> = {
  today: 0,
  "7d": 6,
  "30d": 29,
  "90d": 89,
};

/** Returns [from, to] as UTC instants for a named period, in Nairobi time. */
export function periodRange(period: unknown): { from: Date; to: Date; label: Period } {
  const label: Period =
    period === "today" ||
    period === "7d" ||
    period === "30d" ||
    period === "90d" ||
    period === "month" ||
    period === "year"
      ? period
      : "30d";

  const to = new Date(Date.now() + 1000);
  if (label === "month" || label === "year") {
    const shifted = nairobiNow();
    const localStart =
      label === "month"
        ? Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1)
        : Date.UTC(shifted.getUTCFullYear(), 0, 1);
    return { from: new Date(localStart - NAIROBI_OFFSET_MS), to, label };
  }
  return { from: nairobiDayStart(PERIOD_DAYS[label]), to, label };
}

function previousRange(period: Period): { from: Date; to: Date } {
  const { from, to } = periodRange(period);
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - span), to: from };
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function requireShop(ctx: ToolContext): string {
  if (!ctx.shopId) {
    throw new HttpError(
      "forbidden",
      "No active shop is attached to this request, so shop data cannot be read.",
      403,
    );
  }
  return ctx.shopId;
}

function requireOwner(ctx: ToolContext): string {
  const shopId = requireShop(ctx);
  if (ctx.role !== "owner") {
    throw new HttpError(
      "forbidden",
      "Only the shop owner can read profit and cost figures.",
      403,
    );
  }
  return shopId;
}

function limitOf(value: unknown, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), max);
}

function safeInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

// ---------------------------------------------------------------------------
// Tool definitions exposed to the model
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "get_shop_profile",
      description: "Active shop name, currency, business type and the caller's role.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_low_stock",
      description: "Products at or below their low-stock threshold.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description: "Completed sales for a period, plus the previous period for comparison.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "7d", "30d", "90d", "month", "year"] },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_products",
      description: "Best-selling products in a period.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "7d", "30d", "90d", "month", "year"] },
          limit: { type: "integer" },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_expenses_summary",
      description: "Recorded expenses for a period, total and by category.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "7d", "30d", "90d", "month", "year"] },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_debtors",
      description: "Credit customers with an outstanding balance.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stock_movements",
      description: "Latest recorded stock movements.",
      parameters: {
        type: "object",
        properties: { limit: { type: "integer" } },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_business_overview",
      description: "Owner-only. Sales, estimated cost, expenses and net for a period.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "7d", "30d", "90d", "month", "year"] },
        },
        required: ["period"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_refund_summary",
      description: "Refunds recorded in a period.",
      parameters: {
        type: "object",
        properties: {
          period: { type: "string", enum: ["today", "7d", "30d", "90d", "month", "year"] },
        },
        required: ["period"],
      },
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  switch (name) {
    case "get_shop_profile":
      return getShopProfile(ctx);
    case "get_low_stock":
      return getLowStock(ctx, limitOf(args["limit"], 10, 50));
    case "get_sales_summary":
      return getSalesSummary(ctx, periodRange(args["period"]));
    case "get_top_products":
      return getTopProducts(ctx, periodRange(args["period"]), limitOf(args["limit"], 5, 15));
    case "get_expenses_summary":
      return getExpensesSummary(ctx, periodRange(args["period"]));
    case "get_debtors":
      return getDebtors(ctx, limitOf(args["limit"], 10, 25));
    case "get_stock_movements":
      return getStockMovements(ctx, limitOf(args["limit"], 10, 30));
    case "get_business_overview":
      return getBusinessOverview(ctx, periodRange(args["period"]));
    case "get_refund_summary":
      return getRefundSummary(ctx, periodRange(args["period"]));
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function getShopProfile(ctx: ToolContext): Promise<ToolResult> {
  const shopId = requireShop(ctx);
  const { data, error } = await ctx.supabase
    .from("shops")
    .select("name, currency, business_type")
    .eq("id", shopId)
    .maybeSingle();
  if (error) return { error: "Could not read the shop profile." };
  return {
    name: data?.name ?? ctx.shopName,
    currency: data?.currency ?? ctx.currency,
    business_type: data?.business_type ?? null,
    role: ctx.role,
  };
}

async function getLowStock(ctx: ToolContext, limit: number): Promise<ToolResult> {
  const shopId = requireShop(ctx);
  const { data, error } = await ctx.supabase
    .from("products")
    .select("name, quantity, unit, low_stock_threshold")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .limit(1000);
  if (error) return { error: "Could not read products." };

  const low = (data ?? [])
    .filter((row) => Number(row.quantity) <= Number(row.low_stock_threshold))
    .sort((a, b) => Number(a.quantity) - Number(b.quantity))
    .slice(0, limit)
    .map((row) => ({
      name: row.name,
      quantity: Number(row.quantity),
      unit: row.unit,
      threshold: Number(row.low_stock_threshold),
    }));

  return {
    low_stock_count: low.length,
    products: low,
    note: low.length === 0 ? "No active product is at or below its threshold." : undefined,
  };
}

async function getSalesSummary(
  ctx: ToolContext,
  range: { from: Date; to: Date; label: Period },
): Promise<ToolResult> {
  const shopId = requireShop(ctx);
  const current = await salesTotals(ctx, shopId, range.from, range.to);
  const prev = previousRange(range.label);
  const previous = await salesTotals(ctx, shopId, prev.from, prev.to);

  return {
    period: range.label,
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    currency: ctx.currency,
    sales: current.count,
    total_recorded: money(current.total),
    average_sale: current.count > 0 ? money(current.total / current.count) : 0,
    largest_sale: money(current.max),
    previous_period: {
      sales: previous.count,
      total_recorded: money(previous.total),
    },
  };
}

async function salesTotals(
  ctx: ToolContext,
  shopId: string,
  from: Date,
  to: Date,
): Promise<{ count: number; total: number; max: number }> {
  const { data, error } = await ctx.supabase
    .from("sales")
    .select("total_amount")
    .eq("shop_id", shopId)
    .eq("status", "completed")
    .gte("sold_at", from.toISOString())
    .lt("sold_at", to.toISOString())
    .limit(5000);
  if (error) return { count: 0, total: 0, max: 0 };

  const rows = data ?? [];
  let total = 0;
  let max = 0;
  for (const row of rows) {
    const value = money(row.total_amount);
    total += value;
    if (value > max) max = value;
  }
  return { count: rows.length, total, max };
}

async function getTopProducts(
  ctx: ToolContext,
  range: { from: Date; to: Date; label: Period },
  limit: number,
): Promise<ToolResult> {
  const shopId = requireShop(ctx);
  const { data, error } = await ctx.supabase
    .from("sale_items")
    .select("product_name, quantity, subtotal")
    .eq("shop_id", shopId)
    .gte("created_at", range.from.toISOString())
    .lt("created_at", range.to.toISOString())
    .limit(5000);
  if (error) return { error: "Could not read sale lines." };

  const byName = new Map<string, { quantity: number; revenue: number }>();
  for (const row of data ?? []) {
    const key = String(row.product_name ?? "Unknown product");
    const entry = byName.get(key) ?? { quantity: 0, revenue: 0 };
    entry.quantity += Number(row.quantity ?? 0);
    entry.revenue += money(row.subtotal);
    byName.set(key, entry);
  }

  const ranked = [...byName.entries()]
    .sort((a, b) => b[1].quantity - a[1].quantity)
    .slice(0, limit)
    .map(([name, entry]) => ({
      name,
      quantity: Math.round(entry.quantity * 100) / 100,
      revenue: money(entry.revenue),
    }));

  return { period: range.label, currency: ctx.currency, products: ranked };
}

async function getExpensesSummary(
  ctx: ToolContext,
  range: { from: Date; to: Date; label: Period },
): Promise<ToolResult> {
  const shopId = requireShop(ctx);
  const { data, error } = await ctx.supabase
    .from("expenses")
    .select("category, amount")
    .eq("shop_id", shopId)
    .gte("spent_at", range.from.toISOString())
    .lt("spent_at", range.to.toISOString())
    .limit(5000);
  if (error) return { error: "Could not read expenses." };

  const byCategory = new Map<string, number>();
  let total = 0;
  for (const row of data ?? []) {
    const amount = money(row.amount);
    total += amount;
    const key = String(row.category ?? "other");
    byCategory.set(key, (byCategory.get(key) ?? 0) + amount);
  }

  return {
    period: range.label,
    currency: ctx.currency,
    entries: (data ?? []).length,
    total_recorded: money(total),
    by_category: [...byCategory.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([category, amount]) => ({ category, amount: money(amount) })),
  };
}

async function getDebtors(ctx: ToolContext, limit: number): Promise<ToolResult> {
  const shopId = requireShop(ctx);
  const { data, error } = await ctx.supabase
    .from("debtors")
    .select("name, total_owed")
    .eq("shop_id", shopId)
    .gt("total_owed", 0)
    .order("total_owed", { ascending: false })
    .limit(limit);
  if (error) return { error: "Could not read debtors." };

  const rows = (data ?? []).map((row) => ({
    name: row.name,
    owed: money(row.total_owed),
  }));

  return {
    currency: ctx.currency,
    debtor_count: rows.length,
    total_outstanding: money(rows.reduce((sum, row) => sum + row.owed, 0)),
    debtors: rows,
  };
}

async function getStockMovements(ctx: ToolContext, limit: number): Promise<ToolResult> {
  const shopId = requireShop(ctx);
  const { data, error } = await ctx.supabase
    .from("inventory_movements")
    .select("movement_type, quantity, created_at, notes, products(name)")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { error: "Could not read stock movements." };

  return {
    movements: (data ?? []).map((row) => {
      const product = row.products as { name?: string } | null;
      return {
        type: row.movement_type,
        product: product?.name ?? null,
        quantity: Number(row.quantity),
        at: row.created_at,
        note: row.notes ?? null,
      };
    }),
  };
}

async function getBusinessOverview(
  ctx: ToolContext,
  range: { from: Date; to: Date; label: Period },
): Promise<ToolResult> {
  const shopId = requireOwner(ctx);

  const sales = await salesTotals(ctx, shopId, range.from, range.to);

  const { data: lines, error: lineError } = await ctx.supabase
    .from("sale_items")
    .select("quantity, buying_price")
    .eq("shop_id", shopId)
    .gte("created_at", range.from.toISOString())
    .lt("created_at", range.to.toISOString())
    .limit(5000);
  if (lineError) return { error: "Could not read sale lines." };

  let cost = 0;
  for (const line of lines ?? []) {
    cost += Number(line.quantity ?? 0) * Number(line.buying_price ?? 0);
  }

  const { data: expenses, error: expenseError } = await ctx.supabase
    .from("expenses")
    .select("amount")
    .eq("shop_id", shopId)
    .gte("spent_at", range.from.toISOString())
    .lt("spent_at", range.to.toISOString())
    .limit(5000);
  if (expenseError) return { error: "Could not read expenses." };

  const expenseTotal = (expenses ?? []).reduce((sum, row) => sum + money(row.amount), 0);
  const revenue = money(sales.total);
  const grossProfit = money(revenue - cost);

  return {
    period: range.label,
    currency: ctx.currency,
    recorded_sales: sales.count,
    revenue_recorded: revenue,
    cost_of_goods_estimate: money(cost),
    gross_profit_estimate: grossProfit,
    expenses_recorded: money(expenseTotal),
    net_after_expenses_estimate: money(grossProfit - expenseTotal),
    definitions: {
      revenue: "Sum of recorded completed sales in the period.",
      cost: "Quantity sold × the buying price currently on file for each sold line. This is an estimate, not an invoice-matched cost.",
      gross_profit: "Revenue minus the estimated cost. Do not describe it as net profit.",
      net: "Gross profit estimate minus recorded expenses. Excludes taxes, wastage and any cost not recorded in SAVO.",
    },
  };
}

async function getRefundSummary(
  ctx: ToolContext,
  range: { from: Date; to: Date; label: Period },
): Promise<ToolResult> {
  const shopId = requireShop(ctx);
  const { data, error } = await ctx.supabase
    .from("refunds")
    .select("total_amount, status")
    .eq("shop_id", shopId)
    .gte("created_at", range.from.toISOString())
    .lt("created_at", range.to.toISOString())
    .limit(2000);
  if (error) return { error: "Could not read refunds." };

  const byStatus = new Map<string, { count: number; total: number }>();
  let total = 0;
  for (const row of data ?? []) {
    const amount = money(row.total_amount);
    total += amount;
    const key = String(row.status ?? "unknown");
    const entry = byStatus.get(key) ?? { count: 0, total: 0 };
    entry.count += 1;
    entry.total += amount;
    byStatus.set(key, entry);
  }

  return {
    period: range.label,
    currency: ctx.currency,
    refunds: (data ?? []).length,
    total_value: money(total),
    by_status: [...byStatus.entries()].map(([status, entry]) => ({
      status,
      count: entry.count,
      total: money(entry.total),
    })),
  };
}

export { safeInt };
