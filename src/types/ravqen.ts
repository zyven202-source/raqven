/**
 * RAVQEN domain types.
 *
 * These are thin, portable aliases over the generated database types so that
 * application code never imports the generated file directly. If the project
 * is later moved off Lovable, only `src/integrations/supabase` and this file
 * need to be repointed.
 */
import type { Database } from "@/integrations/supabase/types";

type Tables = Database["public"]["Tables"];
type Enums = Database["public"]["Enums"];

export type ShopRole = Enums["shop_role"];
export type MemberStatus = Enums["member_status"];
export type MovementType = Enums["movement_type"];
export type SaleStatus = Enums["sale_status"];
export type PaymentMethod = Enums["payment_method"];
export type RefundStatus = Enums["refund_status"];

export type Profile = Tables["profiles"]["Row"];
export type ProfileInput = Tables["profiles"]["Update"];

export type Shop = Tables["shops"]["Row"];
export type ShopInsert = Tables["shops"]["Insert"];
export type ShopUpdate = Tables["shops"]["Update"];

export type ShopMember = Tables["shop_members"]["Row"];
export type EmployeeAccessCode = Tables["employee_access_codes"]["Row"];

export type Category = Tables["categories"]["Row"];
export type Product = Tables["products"]["Row"];
export type ProductInsert = Tables["products"]["Insert"];
/**
 * Patch shapes for `.update(...)`.
 *
 * Services build their update object field by field (so a patch only touches
 * what the caller actually sent) but must still be typed against the schema —
 * that is what stops a renamed column from silently reaching production.
 */
export type ProductUpdate = Tables["products"]["Update"];
export type InventoryMovement = Tables["inventory_movements"]["Row"];

export type Sale = Tables["sales"]["Row"];
export type SaleItem = Tables["sale_items"]["Row"];
export type Payment = Tables["payments"]["Row"];

export type Debtor = Tables["debtors"]["Row"];
export type DebtorUpdate = Tables["debtors"]["Update"];
export type DebtorPayment = Tables["debtor_payments"]["Row"];

export type Expense = Tables["expenses"]["Row"];
export type ExpenseUpdate = Tables["expenses"]["Update"];
export type Refund = Tables["refunds"]["Row"];
export type RefundItem = Tables["refund_items"]["Row"];
export type ReceiptSettings = Tables["receipt_settings"]["Row"];
export type ReceiptSettingsUpdate = Tables["receipt_settings"]["Update"];
export type ShopMemberUpdate = Tables["shop_members"]["Update"];

/** Governance tables. Read-only from the client by design — see the migration. */
export type AuditLogEntry = Tables["audit_log"]["Row"];
export type ConsentRecord = Tables["consent_records"]["Row"];
export type DataRequest = Tables["data_requests"]["Row"];

/** A shop together with the signed-in user's role in it. */
export interface ShopWithRole extends Shop {
  role: ShopRole;
}

export const STORAGE_BUCKETS = {
  shopLogos: "shop-logos",
  productImages: "product-images",
  expenseReceipts: "expense-receipts",
} as const;
