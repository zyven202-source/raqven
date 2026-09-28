/**
 * Receipt settings. Owner-configured, readable by every member of the shop —
 * the RLS policies enforce exactly that split.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ReceiptSettings, ReceiptSettingsUpdate } from "@/types/ravqen";

export const RECEIPT_SETTINGS_COLUMNS =
  "id, shop_id, header_text, footer_text, show_logo, logo_url, show_tax, tax_rate, receipt_prefix, paper_width_mm, created_at, updated_at";

export async function getReceiptSettings(shopId: string): Promise<ReceiptSettings | null> {
  const { data, error } = await supabase
    .from("receipt_settings")
    .select(RECEIPT_SETTINGS_COLUMNS)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface UpdateReceiptSettingsInput {
  headerText?: string | null;
  footerText?: string | null;
  showLogo?: boolean;
  logoUrl?: string | null;
  showTax?: boolean;
  taxRate?: number;
  receiptPrefix?: string;
  paperWidthMm?: 58 | 80;
}

export async function updateReceiptSettings(
  shopId: string,
  patch: UpdateReceiptSettingsInput,
): Promise<ReceiptSettings> {
  const update: ReceiptSettingsUpdate = {};
  if (patch.headerText !== undefined) update["header_text"] = patch.headerText?.trim() || null;
  if (patch.footerText !== undefined) update["footer_text"] = patch.footerText;
  if (patch.showLogo !== undefined) update["show_logo"] = patch.showLogo;
  if (patch.logoUrl !== undefined) update["logo_url"] = patch.logoUrl;
  if (patch.showTax !== undefined) update["show_tax"] = patch.showTax;
  if (patch.taxRate !== undefined) update["tax_rate"] = patch.taxRate;
  if (patch.receiptPrefix !== undefined) {
    const prefix = patch.receiptPrefix.trim().toUpperCase().slice(0, 6);
    if (!/^[A-Z0-9]{1,6}$/.test(prefix)) {
      throw new Error("Use 1–6 letters or digits for the receipt prefix.");
    }
    update["receipt_prefix"] = prefix;
  }
  if (patch.paperWidthMm !== undefined) update["paper_width_mm"] = patch.paperWidthMm;

  const { data, error } = await supabase
    .from("receipt_settings")
    .update(update)
    .eq("shop_id", shopId)
    .select(RECEIPT_SETTINGS_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}
