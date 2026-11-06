/**
 * Sales.
 *
 * Creation is a single RPC call. The database is what decides whether the stock
 * is there, what the receipt number is, what the totals are and whether the
 * sale is paid — the client sends the cart and reads back the outcome. There is
 * no client-side path that writes a sale row.
 */
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics-tracker";
import { ANALYTICS_EVENTS } from "@/services/analytics.service";
import type {
  Debtor,
  Payment,
  PaymentMethod,
  Product,
  Refund,
  RefundItem,
  Sale,
  SaleItem,
  SaleStatus,
  Shop,
} from "@/types/savo";

export interface CartLineInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  /** Per-line discount, subtracted from quantity × unit price. */
  discountAmount: number;
}

export interface CreateSaleInput {
  shopId: string;
  lines: CartLineInput[];
  paymentMethod: PaymentMethod;
  /** Cash tendered by the customer; for other methods the total is assumed. */
  amountTendered?: number;
  /** Sale-level discount applied after the line totals. */
  discountAmount?: number;
  debtorName?: string | null;
  debtorPhone?: string | null;
  note?: string | null;
  /**
   * The offline outbox's identity for this checkout: one UUID per attempt.
   * Sent as `p_client_tx_id`, where a unique index makes a retry of the same
   * attempt return the original sale rather than record a duplicate. Omitted
   * (NULL) for callers that predate the outbox, so their behaviour is
   * unchanged.
   */
  clientTxId?: string | null;
}

export interface CreateSaleResult {
  saleId: string;
  receiptNumber: string;
  subtotal: number;
  discount: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  changeDue: number;
  status: SaleStatus;
  debtorId: string | null;
}

/** Total a cart would come to, given a sale-level discount. */
export function cartTotals(lines: CartLineInput[], discountAmount = 0) {
  const itemsTotal = lines.reduce(
    (sum, line) => sum + (line.quantity * line.unitPrice - (line.discountAmount || 0)),
    0,
  );
  const discount = Math.min(Math.max(discountAmount, 0), itemsTotal);
  return {
    itemsTotal: Math.round(itemsTotal * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    total: Math.round((itemsTotal - discount) * 100) / 100,
  };
}

export async function createSale(input: CreateSaleInput): Promise<CreateSaleResult> {
  if (input.lines.length === 0) throw new Error("Add at least one item to the sale.");

  const args: {
    p_shop_id: string;
    p_items: {
      product_id: string;
      quantity: number;
      unit_price: number;
      discount_amount: number;
    }[];
    p_payment_method: PaymentMethod;
    p_amount_tendered?: number;
    p_discount_amount?: number;
    p_debtor_name?: string;
    p_debtor_phone?: string;
    p_note?: string;
    p_client_tx_id?: string;
  } = {
    p_shop_id: input.shopId,
    p_items: input.lines.map((line) => ({
      product_id: line.productId,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      discount_amount: line.discountAmount || 0,
    })),
    p_payment_method: input.paymentMethod,
  };

  if (input.amountTendered != null) args.p_amount_tendered = input.amountTendered;
  if (input.discountAmount != null) args.p_discount_amount = input.discountAmount;
  if (input.debtorName) args.p_debtor_name = input.debtorName;
  if (input.debtorPhone) args.p_debtor_phone = input.debtorPhone;
  if (input.note) args.p_note = input.note;
  if (input.clientTxId) args.p_client_tx_id = input.clientTxId;

  const { data, error } = await supabase.rpc("create_sale", args);
  if (error) throw error;

  const result = data as unknown as {
    sale_id: string;
    receipt_number: string;
    subtotal: number;
    discount: number;
    total: number;
    amount_paid: number;
    balance_due: number;
    change_due: number;
    status: SaleStatus;
    debtor_id: string | null;
    /** Present when the server recognised a replayed operation id. */
    deduplicated?: boolean;
  };

  // A replayed offline sale is not a second sale; only a fresh one is counted.
  if (!result.deduplicated) {
    trackEvent(ANALYTICS_EVENTS.transactionCompleted, {
      shopId: input.shopId,
      properties: { items: input.lines.length, status: result.status },
    });
  }

  return {
    saleId: result.sale_id,
    receiptNumber: result.receipt_number,
    subtotal: Number(result.subtotal),
    discount: Number(result.discount),
    total: Number(result.total),
    amountPaid: Number(result.amount_paid),
    balanceDue: Number(result.balance_due),
    changeDue: Number(result.change_due),
    status: result.status,
    debtorId: result.debtor_id,
  };
}

export interface ListSalesOptions {
  shopId: string;
  limit?: number;
  from?: string | undefined;
  to?: string | undefined;
  /** Matches receipt number or customer name. */
  search?: string | undefined;
}

export async function listSales(options: ListSalesOptions): Promise<Sale[]> {
  let query = supabase
    .from("sales")
    .select(
      "id, shop_id, receipt_number, debtor_id, customer_name, customer_phone, subtotal, discount_amount, tax_amount, total_amount, amount_paid, balance_due, status, note, user_id, sold_at, created_at, updated_at, client_tx_id",
    )
    .eq("shop_id", options.shopId)
    .order("sold_at", { ascending: false })
    .limit(options.limit ?? 50);

  if (options.from) query = query.gte("sold_at", options.from);
  if (options.to) query = query.lt("sold_at", options.to);
  if (options.search) {
    const term = options.search.replace(/[,()*%\\]/g, "").trim();
    if (term) query = query.or(`receipt_number.ilike.%${term}%,customer_name.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getSale(saleId: string): Promise<Sale | null> {
  const { data, error } = await supabase.from("sales").select("*").eq("id", saleId).maybeSingle();
  if (error) throw error;
  return data;
}

export interface SaleDetail {
  sale: Sale;
  items: SaleItem[];
  payments: Payment[];
  refunds: Refund[];
  refundItems: RefundItem[];
  debtor: Debtor | null;
}

export async function getSaleDetail(saleId: string): Promise<SaleDetail> {
  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select("*")
    .eq("id", saleId)
    .maybeSingle();
  if (saleError) throw saleError;
  if (!sale) throw new Error("That sale could not be found.");

  const [items, payments, refunds] = await Promise.all([
    supabase.from("sale_items").select("*").eq("sale_id", saleId).order("created_at"),
    supabase.from("payments").select("*").eq("sale_id", saleId).order("paid_at"),
    supabase.from("refunds").select("*").eq("sale_id", saleId).order("created_at"),
  ]);

  if (items.error) throw items.error;
  if (payments.error) throw payments.error;
  if (refunds.error) throw refunds.error;

  const refundIds = (refunds.data ?? []).map((row) => row.id);
  let refundItems: RefundItem[] = [];
  if (refundIds.length > 0) {
    const { data, error } = await supabase
      .from("refund_items")
      .select("*")
      .in("refund_id", refundIds);
    if (error) throw error;
    refundItems = data ?? [];
  }

  let debtor: Debtor | null = null;
  if (sale.debtor_id) {
    const { data, error } = await supabase
      .from("debtors")
      .select("*")
      .eq("id", sale.debtor_id)
      .maybeSingle();
    if (error) throw error;
    debtor = data;
  }

  return {
    sale,
    items: items.data ?? [],
    payments: payments.data ?? [],
    refunds: refunds.data ?? [],
    refundItems,
    debtor,
  };
}

/**
 * Reads the whole sale + shop context needed to render a receipt, in one place,
 * so the receipt can never be built from anything but stored rows.
 */
export interface ReceiptPayload {
  sale: Sale;
  items: SaleItem[];
  payments: Payment[];
  refunds: Refund[];
  debtor: Debtor | null;
  shop: Shop;
  /** The member who rang the sale up, when the directory can name them. */
  cashierName: string | null;
  settings: {
    footer_text: string | null;
    header_text: string | null;
    show_logo: boolean;
    logo_url: string | null;
    receipt_prefix: string;
    paper_width_mm: number;
    show_tax: boolean;
    tax_rate: number;
  } | null;
}

export async function getReceiptPayload(saleId: string): Promise<ReceiptPayload> {
  const detail = await getSaleDetail(saleId);

  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select("*")
    .eq("id", detail.sale.shop_id)
    .single();
  if (shopError) throw shopError;

  const { data: settings, error: settingsError } = await supabase
    .from("receipt_settings")
    .select(
      "footer_text, header_text, show_logo, logo_url, receipt_prefix, paper_width_mm, show_tax, tax_rate",
    )
    .eq("shop_id", detail.sale.shop_id)
    .maybeSingle();
  if (settingsError) throw settingsError;

  /*
   * The cashier line is a nicety, not a load-bearing fact: if the member
   * directory refuses or the seller has since left, the receipt still prints
   * without a name rather than failing the whole sale's receipt.
   */
  let cashierName: string | null = null;
  if (detail.sale.user_id) {
    const { data: members } = await supabase.rpc("shop_member_directory", {
      p_shop_id: detail.sale.shop_id,
    });
    const match = (members ?? []).find((member) => member.user_id === detail.sale.user_id);
    cashierName = match?.display_name || null;
  }

  return {
    sale: detail.sale,
    items: detail.items,
    payments: detail.payments,
    refunds: detail.refunds,
    debtor: detail.debtor,
    shop,
    cashierName,
    settings,
  };
}

/**
 * The subset of a product the till needs. Declared explicitly because the POS
 * deliberately selects narrow columns rather than the whole row.
 */
export type SellableProduct = Pick<
  Product,
  | "id"
  | "shop_id"
  | "name"
  | "barcode"
  | "unit"
  | "selling_price"
  | "buying_price"
  | "quantity"
  | "is_low_stock"
>;

/** Products for the POS grid: active only, name-ordered, narrow columns. */
export async function listSellableProducts(
  shopId: string,
  limit = 200,
): Promise<SellableProduct[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, shop_id, name, barcode, unit, selling_price, buying_price, quantity, is_low_stock")
    .eq("shop_id", shopId)
    .eq("is_active", true)
    .order("name")
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}
