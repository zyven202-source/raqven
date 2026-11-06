/**
 * Expenses.
 *
 * The category list mirrors the `expenses_category_valid` check constraint in
 * the database — the UI offers exactly what the database will accept, so an
 * invalid category is impossible rather than merely unlikely.
 */
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics-tracker";
import { ANALYTICS_EVENTS } from "@/services/analytics.service";
import type { Expense, ExpenseUpdate, PaymentMethod } from "@/types/savo";

export const EXPENSE_CATEGORIES = [
  { value: "lunch", label: "Lunch" },
  { value: "transport", label: "Transport" },
  { value: "rent", label: "Rent" },
  { value: "electricity", label: "Electricity" },
  { value: "packaging", label: "Packaging" },
  { value: "repairs", label: "Repairs" },
  { value: "restocking", label: "Restocking" },
  { value: "other", label: "Other" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

export function expenseCategoryLabel(value: string) {
  return EXPENSE_CATEGORIES.find((category) => category.value === value)?.label ?? "Other";
}

export interface ListExpensesOptions {
  shopId: string;
  limit?: number;
  from?: string | undefined;
  to?: string | undefined;
  category?: ExpenseCategory | undefined;
}

export async function listExpenses(options: ListExpensesOptions): Promise<Expense[]> {
  let query = supabase
    .from("expenses")
    .select("*")
    .eq("shop_id", options.shopId)
    .order("spent_at", { ascending: false })
    .limit(options.limit ?? 100);

  if (options.from) query = query.gte("spent_at", options.from);
  if (options.to) query = query.lt("spent_at", options.to);
  if (options.category) query = query.eq("category", options.category);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export interface CreateExpenseInput {
  shopId: string;
  category: ExpenseCategory;
  description?: string | null;
  amount: number;
  method: PaymentMethod;
  spentAt?: string;
  receiptUrl?: string | null;
}

export async function createExpense(input: CreateExpenseInput): Promise<Expense> {
  if (!(input.amount > 0)) throw new Error("Enter an amount above zero.");

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("You must be signed in to record an expense.");

  const row: {
    shop_id: string;
    category: string;
    description: string | null;
    amount: number;
    method: PaymentMethod;
    user_id: string;
    receipt_url?: string;
    spent_at?: string;
  } = {
    shop_id: input.shopId,
    category: input.category,
    description: input.description?.trim() || null,
    amount: input.amount,
    method: input.method,
    user_id: auth.user.id,
  };
  if (input.receiptUrl) row.receipt_url = input.receiptUrl;
  if (input.spentAt) row.spent_at = input.spentAt;

  const { data, error } = await supabase.from("expenses").insert(row).select().single();
  if (error) throw error;

  trackEvent(ANALYTICS_EVENTS.expenseCreated, { shopId: input.shopId });

  return data;
}

/**
 * Expenses are editable only by the person who recorded them — the RLS policy
 * says so, so this will simply update nothing for someone else's row.
 */
export async function updateExpense(
  shopId: string,
  expenseId: string,
  patch: {
    category?: ExpenseCategory;
    description?: string | null;
    amount?: number;
    method?: PaymentMethod;
    spentAt?: string;
  },
): Promise<Expense> {
  const update: ExpenseUpdate = { shop_id: shopId };
  if (patch.category !== undefined) update["category"] = patch.category;
  if (patch.description !== undefined) update["description"] = patch.description?.trim() || null;
  if (patch.amount !== undefined) update["amount"] = patch.amount;
  if (patch.method !== undefined) update["method"] = patch.method;
  if (patch.spentAt !== undefined) update["spent_at"] = patch.spentAt;

  const { data, error } = await supabase
    .from("expenses")
    .update(update)
    .eq("id", expenseId)
    .eq("shop_id", shopId)
    .select()
    .single();
  if (error) throw error;

  trackEvent(ANALYTICS_EVENTS.expenseUpdated, { shopId });

  return data;
}
