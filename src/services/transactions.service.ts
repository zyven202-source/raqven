/**
 * The transaction ledger.
 *
 * SAVO keeps money and stock in separate, purpose-built tables — that is what
 * makes the balances verifiable. The ledger is a read model over them: one row
 * per business event, newest first, each one traceable back to the row that
 * produced it.
 *
 * Money rows and stock rows are deliberately distinguished. A stock-in is not a
 * cash movement (the goods may have been bought on account, and restocking can
 * also be logged as an expense), so it is reported as a neutral quantity event
 * rather than being added to a cash total and double-counted.
 */
import { supabase } from "@/integrations/supabase/client";
import type { MovementType, PaymentMethod, SaleStatus } from "@/types/savo";

export type TransactionKind =
  "sale" | "payment" | "expense" | "stock_in" | "stock_adjustment" | "refund" | "debt_payment";

export type TransactionDirection = "in" | "out" | "neutral";

export interface TransactionRow {
  /** Stable id for React keys and for opening the detail view. */
  id: string;
  kind: TransactionKind;
  /** The underlying row's id, so the detail view can re-fetch it. */
  sourceId: string;
  occurredAt: string;
  direction: TransactionDirection;
  /** Magnitude, always positive. Direction carries the sign. */
  amount: number;
  title: string;
  subtitle: string | null;
  reference: string | null;
  userName: string | null;
  status: SaleStatus | string | null;
  quantity: number | null;
  unit: string | null;
}

export interface ListTransactionsOptions {
  shopId: string;
  limit?: number;
  from?: string | undefined;
  to?: string | undefined;
  kinds?: TransactionKind[] | undefined;
}

/** Movement types that represent a stock event rather than a money event. */
const STOCK_MOVEMENT_KINDS: Partial<Record<MovementType, TransactionKind>> = {
  stock_in: "stock_in",
  opening: "stock_in",
  adjustment: "stock_adjustment",
  damage: "stock_adjustment",
  transfer: "stock_adjustment",
};

export async function listTransactions(
  options: ListTransactionsOptions,
): Promise<TransactionRow[]> {
  const limit = options.limit ?? 60;
  const { shopId, from, to } = options;

  // Each source is its own narrow query, capped at `limit`. The date window is
  // applied with explicit chaining rather than a shared helper, so the builder
  // types stay concrete.
  let salesQuery = supabase
    .from("sales")
    .select(
      "id, receipt_number, customer_name, total_amount, balance_due, status, user_id, sold_at",
    )
    .eq("shop_id", shopId)
    .order("sold_at", { ascending: false })
    .limit(limit);
  if (from) salesQuery = salesQuery.gte("sold_at", from);
  if (to) salesQuery = salesQuery.lt("sold_at", to);

  let paymentsQuery = supabase
    .from("payments")
    .select("id, sale_id, method, amount, reference, user_id, paid_at")
    .eq("shop_id", shopId)
    .order("paid_at", { ascending: false })
    .limit(limit);
  if (from) paymentsQuery = paymentsQuery.gte("paid_at", from);
  if (to) paymentsQuery = paymentsQuery.lt("paid_at", to);

  let debtorPaymentsQuery = supabase
    .from("debtor_payments")
    .select("id, debtor_id, method, amount, reference, user_id, paid_at")
    .eq("shop_id", shopId)
    .order("paid_at", { ascending: false })
    .limit(limit);
  if (from) debtorPaymentsQuery = debtorPaymentsQuery.gte("paid_at", from);
  if (to) debtorPaymentsQuery = debtorPaymentsQuery.lt("paid_at", to);

  let expensesQuery = supabase
    .from("expenses")
    .select("id, category, description, amount, method, user_id, spent_at")
    .eq("shop_id", shopId)
    .order("spent_at", { ascending: false })
    .limit(limit);
  if (from) expensesQuery = expensesQuery.gte("spent_at", from);
  if (to) expensesQuery = expensesQuery.lt("spent_at", to);

  let refundsQuery = supabase
    .from("refunds")
    .select("id, sale_id, reason, total_amount, status, user_id, created_at")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (from) refundsQuery = refundsQuery.gte("created_at", from);
  if (to) refundsQuery = refundsQuery.lt("created_at", to);

  let movementsQuery = supabase
    .from("inventory_movements")
    .select(
      "id, product_id, movement_type, quantity, unit_cost, reference_id, notes, user_id, created_at",
    )
    .eq("shop_id", shopId)
    .in("movement_type", ["stock_in", "opening", "adjustment", "damage", "transfer"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (from) movementsQuery = movementsQuery.gte("created_at", from);
  if (to) movementsQuery = movementsQuery.lt("created_at", to);

  const [sales, payments, debtorPayments, expenses, refunds, movements, members] =
    await Promise.all([
      salesQuery,
      paymentsQuery,
      debtorPaymentsQuery,
      expensesQuery,
      refundsQuery,
      movementsQuery,
      supabase.rpc("shop_member_directory", { p_shop_id: shopId }),
    ]);

  const names = new Map<string, string>();
  for (const member of members.data ?? []) {
    names.set(member.user_id, member.display_name);
  }

  // Product names come from a second, narrow query rather than an embedded
  // select: the ledger only needs a label, and this keeps it independent of
  // PostgREST relationship inference.
  const productIds = [...new Set((movements.data ?? []).map((row) => row.product_id))];
  const productIndex = new Map<string, { name: string; unit: string }>();
  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, name, unit")
      .in("id", productIds);
    for (const product of products ?? []) {
      productIndex.set(product.id, { name: product.name, unit: product.unit });
    }
  }

  const rows: TransactionRow[] = [];

  for (const sale of sales.data ?? []) {
    rows.push({
      id: `sale:${sale.id}`,
      kind: "sale",
      sourceId: sale.id,
      occurredAt: sale.sold_at,
      direction: "in",
      amount: Number(sale.total_amount),
      title: sale.customer_name ? `Sale to ${sale.customer_name}` : "Sale",
      subtitle: Number(sale.balance_due) > 0 ? "On credit" : null,
      reference: sale.receipt_number,
      userName: sale.user_id ? (names.get(sale.user_id) ?? null) : null,
      status: sale.status,
      quantity: null,
      unit: null,
    });
  }

  for (const payment of payments.data ?? []) {
    rows.push({
      id: `payment:${payment.id}`,
      kind: "payment",
      sourceId: payment.id,
      occurredAt: payment.paid_at,
      direction: "in",
      amount: Number(payment.amount),
      title: `${methodLabel(payment.method)} received`,
      subtitle: null,
      reference: payment.reference,
      userName: payment.user_id ? (names.get(payment.user_id) ?? null) : null,
      status: null,
      quantity: null,
      unit: null,
    });
  }

  for (const payment of debtorPayments.data ?? []) {
    rows.push({
      id: `debt:${payment.id}`,
      kind: "debt_payment",
      sourceId: payment.id,
      occurredAt: payment.paid_at,
      direction: "in",
      amount: Number(payment.amount),
      title: "Debt repayment",
      subtitle: methodLabel(payment.method),
      reference: payment.reference,
      userName: payment.user_id ? (names.get(payment.user_id) ?? null) : null,
      status: null,
      quantity: null,
      unit: null,
    });
  }

  for (const expense of expenses.data ?? []) {
    rows.push({
      id: `expense:${expense.id}`,
      kind: "expense",
      sourceId: expense.id,
      occurredAt: expense.spent_at,
      direction: "out",
      amount: Number(expense.amount),
      title: expense.description?.trim() || "Expense",
      subtitle: methodLabel(expense.method),
      reference: null,
      userName: expense.user_id ? (names.get(expense.user_id) ?? null) : null,
      status: null,
      quantity: null,
      unit: null,
    });
  }

  for (const refund of refunds.data ?? []) {
    rows.push({
      id: `refund:${refund.id}`,
      kind: "refund",
      sourceId: refund.id,
      occurredAt: refund.created_at,
      direction: "out",
      amount: Number(refund.total_amount),
      title: "Refund",
      subtitle: refund.reason?.trim() || null,
      reference: null,
      userName: refund.user_id ? (names.get(refund.user_id) ?? null) : null,
      status: refund.status,
      quantity: null,
      unit: null,
    });
  }

  for (const movement of movements.data ?? []) {
    const kind = STOCK_MOVEMENT_KINDS[movement.movement_type];
    if (!kind) continue;
    const product = productIndex.get(movement.product_id) ?? null;
    const quantity = Number(movement.quantity);

    rows.push({
      id: `move:${movement.id}`,
      kind,
      sourceId: movement.id,
      occurredAt: movement.created_at,
      direction: "neutral",
      amount: Math.abs(quantity * Number(movement.unit_cost ?? 0)),
      title:
        kind === "stock_in"
          ? `Stock in — ${product?.name ?? "product"}`
          : `${movement.movement_type === "damage" ? "Damage" : "Adjustment"} — ${product?.name ?? "product"}`,
      subtitle: movement.notes?.trim() || null,
      reference: null,
      userName: movement.user_id ? (names.get(movement.user_id) ?? null) : null,
      status: null,
      quantity,
      unit: product?.unit ?? null,
    });
  }

  const filtered = options.kinds?.length
    ? rows.filter((row) => options.kinds?.includes(row.kind))
    : rows;

  return filtered
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);
}

export function methodLabel(method: PaymentMethod | string | null) {
  switch (method) {
    case "cash":
      return "Cash";
    case "mpesa":
      return "M-Pesa";
    case "card":
      return "Card";
    case "bank":
      return "Bank";
    case "credit":
      return "Credit";
    default:
      return "Payment";
  }
}

const KIND_LABELS: Record<TransactionKind, string> = {
  sale: "SALE",
  payment: "PAYMENT",
  expense: "EXPENSE",
  stock_in: "STOCK IN",
  stock_adjustment: "ADJUSTMENT",
  refund: "REFUND",
  debt_payment: "DEBT PAYMENT",
};

export function kindLabel(kind: TransactionKind) {
  return KIND_LABELS[kind] ?? "TRANSACTION";
}
