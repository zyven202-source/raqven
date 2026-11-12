/**
 * Debtors — Pith records credit, not a customer CRM.
 *
 * A debtor row exists only because a credit sale created one. Repayments go
 * through the `record_debtor_payment` RPC, which moves the debtor balance and
 * the sale's own balance in one transaction and refuses overpayment.
 */
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics-tracker";
import { ANALYTICS_EVENTS } from "@/services/analytics.service";
import type { Debtor, DebtorPayment, DebtorUpdate, PaymentMethod, Sale } from "@/types/savo";

export async function listDebtors(shopId: string, includeSettled = false): Promise<Debtor[]> {
  let query = supabase
    .from("debtors")
    .select("*")
    .eq("shop_id", shopId)
    .order("total_owed", { ascending: false })
    .limit(200);

  if (!includeSettled) query = query.gt("total_owed", 0);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getDebtor(debtorId: string): Promise<Debtor | null> {
  const { data, error } = await supabase
    .from("debtors")
    .select("*")
    .eq("id", debtorId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface DebtorDetail {
  debtor: Debtor;
  payments: DebtorPayment[];
  /** Every sale this debtor has ever had, so the history is auditable. */
  sales: Sale[];
}

export async function getDebtorDetail(debtorId: string): Promise<DebtorDetail> {
  const { data: debtor, error: debtorError } = await supabase
    .from("debtors")
    .select("*")
    .eq("id", debtorId)
    .maybeSingle();
  if (debtorError) throw debtorError;
  if (!debtor) throw new Error("That debtor could not be found.");

  const [payments, sales] = await Promise.all([
    supabase
      .from("debtor_payments")
      .select("*")
      .eq("debtor_id", debtorId)
      .order("paid_at", { ascending: false }),
    supabase
      .from("sales")
      .select("*")
      .eq("debtor_id", debtorId)
      .order("sold_at", { ascending: false }),
  ]);

  if (payments.error) throw payments.error;
  if (sales.error) throw sales.error;

  return { debtor, payments: payments.data ?? [], sales: sales.data ?? [] };
}

export interface RecordDebtorPaymentInput {
  debtorId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string | null;
  note?: string | null;
}

export interface RecordDebtorPaymentResult {
  paymentId: string;
  amount: number;
  balanceRemaining: number;
}

export async function recordDebtorPayment(
  input: RecordDebtorPaymentInput,
): Promise<RecordDebtorPaymentResult> {
  if (!(input.amount > 0)) throw new Error("Enter an amount above zero.");

  const args: {
    p_debtor_id: string;
    p_amount: number;
    p_method?: PaymentMethod;
    p_reference?: string;
    p_note?: string;
  } = {
    p_debtor_id: input.debtorId,
    p_amount: input.amount,
    p_method: input.method,
  };
  if (input.reference) args.p_reference = input.reference;
  if (input.note) args.p_note = input.note;

  const { data, error } = await supabase.rpc("record_debtor_payment", args);
  if (error) throw error;

  const result = data as unknown as {
    payment_id: string;
    amount: number;
    balance_remaining: number;
  };

  trackEvent(ANALYTICS_EVENTS.debtorPaymentRecorded);

  return {
    paymentId: result.payment_id,
    amount: Number(result.amount),
    balanceRemaining: Number(result.balance_remaining),
  };
}

export async function updateDebtor(
  debtorId: string,
  patch: {
    name?: string;
    phone?: string | null;
    creditLimit?: number | null;
    notes?: string | null;
  },
): Promise<Debtor> {
  const update: DebtorUpdate = {};
  if (patch.name !== undefined) update["name"] = patch.name.trim();
  if (patch.phone !== undefined) update["phone"] = patch.phone?.trim() || null;
  if (patch.creditLimit !== undefined) update["credit_limit"] = patch.creditLimit;
  if (patch.notes !== undefined) update["notes"] = patch.notes;

  const { data, error } = await supabase
    .from("debtors")
    .update(update)
    .eq("id", debtorId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Total owed across the shop — a headline number, computed by the database. */
export async function totalOutstanding(shopId: string): Promise<number> {
  const { data, error } = await supabase.from("debtors").select("total_owed").eq("shop_id", shopId);
  if (error) throw error;
  return (data ?? []).reduce((sum, row) => sum + Number(row.total_owed), 0);
}
