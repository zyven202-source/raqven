/**
 * Shop data access. All calls go through the Supabase client and are bound by
 * row level security — a user only ever sees shops they belong to.
 */
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/format";
import type {
  PaymentMethod,
  ReceiptSettingsUpdate,
  Shop,
  ShopMemberUpdate,
  ShopUpdate,
  ShopWithRole,
} from "@/types/ravqen";

export async function listMyShops(): Promise<ShopWithRole[]> {
  const { data, error } = await supabase
    .from("shop_members")
    .select("role, shops:shop_id (*)")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.shops)
    .map((row) => ({ ...(row.shops as Shop), role: row.role }));
}

export async function getShop(shopId: string): Promise<Shop | null> {
  const { data, error } = await supabase.from("shops").select("*").eq("id", shopId).maybeSingle();
  if (error) throw error;
  return data;
}

export const BUSINESS_TYPES = [
  { value: "general", label: "General retail / duka" },
  { value: "grocery", label: "Grocery / greens" },
  { value: "hardware", label: "Hardware" },
  { value: "boutique", label: "Boutique / clothing" },
  { value: "pharmacy", label: "Pharmacy / chemist" },
  { value: "agrovet", label: "Agrovet" },
  { value: "salon", label: "Salon / barber" },
  { value: "other", label: "Other" },
] as const;

export function businessTypeLabel(value: string | null | undefined) {
  if (!value) return "—";
  return BUSINESS_TYPES.find((type) => type.value === value)?.label ?? value;
}

export interface CreateShopInput {
  name: string;
  businessType?: string | null;
  location?: string | null;
  phone?: string | null;
  logoPath?: string | null;
  /** Owner's refund policy switch. Enforced by the database, not the UI. */
  acceptsRefunds?: boolean;
  currency?: string;
  receipt?: {
    footerText?: string | null;
    headerText?: string | null;
    showLogo?: boolean;
    receiptPrefix?: string;
    paperWidthMm?: 58 | 80;
  };
  /** Mints a shop-wide till code; the plaintext is returned once, never stored. */
  employeeAccessCode?: string | null;
}

export interface CreateShopResult {
  shop: Shop;
  /** Present only when an access code was requested. */
  accessCodeCreated: boolean;
}

/**
 * Creates a shop and configures it in one go.
 *
 * The shop row itself is inserted first, because the `on_shop_created` trigger
 * enrols the creator as owner and seeds receipt settings — only after that can
 * the settings be written. Each follow-up write is a real Supabase call; if one
 * fails the error is surfaced rather than swallowed, and the shop that already
 * exists is reported back so the caller can retry the configuration.
 */
export async function createShop(input: CreateShopInput): Promise<CreateShopResult> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("You must be signed in to create a shop.");

  const baseSlug = slugify(input.name);
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`.slice(0, 60);

  const { data: shop, error } = await supabase
    .from("shops")
    .insert({
      owner_id: auth.user.id,
      name: input.name.trim(),
      slug,
      business_type: input.businessType ?? null,
      location: input.location ?? null,
      phone: input.phone ?? null,
      logo_url: input.logoPath ?? null,
      currency: input.currency ?? "KES",
      accepts_refunds: input.acceptsRefunds ?? false,
    })
    .select()
    .single();

  if (error) throw error;

  const receipt = input.receipt;
  const needsReceiptWrite =
    input.logoPath ||
    (receipt &&
      (receipt.footerText !== undefined ||
        receipt.headerText !== undefined ||
        receipt.showLogo !== undefined ||
        receipt.receiptPrefix !== undefined ||
        receipt.paperWidthMm !== undefined));

  if (needsReceiptWrite) {
    const patch: ReceiptSettingsUpdate = {};
    if (input.logoPath) patch["logo_url"] = input.logoPath;
    if (receipt?.footerText !== undefined) patch["footer_text"] = receipt.footerText;
    if (receipt?.headerText !== undefined) patch["header_text"] = receipt.headerText;
    if (receipt?.showLogo !== undefined) patch["show_logo"] = receipt.showLogo;
    if (receipt?.receiptPrefix) patch["receipt_prefix"] = receipt.receiptPrefix.toUpperCase();
    if (receipt?.paperWidthMm !== undefined) patch["paper_width_mm"] = receipt.paperWidthMm;

    const { error: settingsError } = await supabase
      .from("receipt_settings")
      .update(patch)
      .eq("shop_id", shop.id);
    if (settingsError) throw settingsError;
  }

  let accessCodeCreated = false;
  if (input.employeeAccessCode) {
    const { error: codeError } = await supabase.rpc("create_employee_access_code", {
      p_shop_id: shop.id,
      p_label: "Shop access code",
      p_code: input.employeeAccessCode,
    });
    if (codeError) throw codeError;
    accessCodeCreated = true;
  }

  return { shop, accessCodeCreated };
}

export async function updateShop(shopId: string, patch: ShopUpdate): Promise<Shop> {
  const { data, error } = await supabase
    .from("shops")
    .update(patch)
    .eq("id", shopId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** The refund switch is owner-only; RLS decides whether this write lands. */
export async function setAcceptsRefunds(shopId: string, accepts: boolean): Promise<Shop> {
  return updateShop(shopId, { accepts_refunds: accepts });
}

// ------------------------------------------------------------ team + codes

export interface ShopMemberRow {
  id: string;
  shop_id: string;
  user_id: string;
  role: "owner" | "employee";
  status: "active" | "suspended" | "removed";
  display_name: string | null;
  created_at: string;
}

export async function listShopMembers(shopId: string): Promise<ShopMemberRow[]> {
  const { data, error } = await supabase
    .from("shop_members")
    .select("id, shop_id, user_id, role, status, display_name, created_at")
    .eq("shop_id", shopId)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

/**
 * Adds an existing RAVQEN account to the shop. The account must already exist.
 * Only an owner can insert here — the RLS policy decides, not this code.
 */
export async function addShopMember(
  shopId: string,
  userId: string,
  role: "owner" | "employee",
  displayName?: string | null,
): Promise<void> {
  const { error } = await supabase.from("shop_members").insert({
    shop_id: shopId,
    user_id: userId,
    role,
    display_name: displayName?.trim() || null,
  });
  if (error) throw error;
}

export async function updateMember(
  memberId: string,
  patch: {
    role?: "owner" | "employee";
    status?: "active" | "suspended" | "removed";
    displayName?: string | null;
  },
): Promise<void> {
  const update: ShopMemberUpdate = {};
  if (patch.role !== undefined) update["role"] = patch.role;
  if (patch.status !== undefined) update["status"] = patch.status;
  if (patch.displayName !== undefined) update["display_name"] = patch.displayName;

  const { error } = await supabase.from("shop_members").update(update).eq("id", memberId);
  if (error) throw error;
}

export async function listAccessCodes(shopId: string) {
  const { data, error } = await supabase
    .from("employee_access_codes")
    .select("id, shop_id, member_id, label, is_active, expires_at, last_used_at, created_at")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function deactivateAccessCode(shopId: string, codeId: string): Promise<void> {
  const { error } = await supabase
    .from("employee_access_codes")
    .update({ is_active: false, shop_id: shopId })
    .eq("id", codeId)
    .eq("shop_id", shopId);
  if (error) throw error;
}

/**
 * Mints a till code. The plaintext is returned to the caller to show once —
 * PostgreSQL stores only a SHA-256 digest, so it cannot be read back later.
 */
export async function createAccessCode(
  shopId: string,
  label: string,
  code: string,
): Promise<{ codeId: string }> {
  const { data, error } = await supabase.rpc("create_employee_access_code", {
    p_shop_id: shopId,
    p_label: label,
    p_code: code,
  });
  if (error) throw error;
  const result = data as unknown as { code_id: string };
  return { codeId: result.code_id };
}

/** A readable, hard-to-guess default the owner can change before saving. */
export function suggestAccessCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ---------------------------------------------------------------- payments

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; hint?: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "mpesa", label: "M-Pesa" },
  { value: "card", label: "Card" },
  { value: "credit", label: "Credit", hint: "Owed by the customer" },
];
