/**
 * Shop data access. All calls go through the Supabase client and are bound by
 * row level security — a user only ever sees shops they belong to.
 */
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/format";
import { removeShopFiles } from "@/services/storage.service";
import type {
  PaymentMethod,
  ReceiptSettingsUpdate,
  Shop,
  ShopMemberUpdate,
  ShopUpdate,
  ShopWithRole,
} from "@/types/savo";

/**
 * The shop columns the app is allowed to see. Selected explicitly rather than
 * with `*` so internal columns (the access-code salt) can never leak into the
 * client bundle by accident when one is added.
 */
const SHOP_COLUMNS =
  "id, name, slug, owner_id, business_type, currency, phone, email, address, city, kra_pin, logo_url, location, is_active, accepts_refunds, employee_joining_enabled, created_at, updated_at" as const;

export async function listMyShops(): Promise<ShopWithRole[]> {
  // The owner may *see* every membership row of their shops (RLS), so without
  // this filter the hub would render the same shop once per team member — one
  // duplicate list entry per employee who has joined. Only my own memberships
  // decide which shops are mine.
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) return [];

  const { data, error } = await supabase
    .from("shop_members")
    .select(`role, shops:shop_id (${SHOP_COLUMNS})`)
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.shops)
    .map((row) => ({ ...(row.shops as Shop), role: row.role }));
}

export async function getShop(shopId: string): Promise<Shop | null> {
  const { data, error } = await supabase
    .from("shops")
    .select(SHOP_COLUMNS)
    .eq("id", shopId)
    .maybeSingle();
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
  /** Mints a staff access code; the plaintext is shown once, never stored. */
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
    .select(SHOP_COLUMNS)
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
      p_label: "Staff access code",
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
    .select(SHOP_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/** The refund switch is owner-only; RLS decides whether this write lands. */
export async function setAcceptsRefunds(shopId: string, accepts: boolean): Promise<Shop> {
  return updateShop(shopId, { accepts_refunds: accepts });
}

// -------------------------------------------------------- employee joining

/**
 * Joins the signed-in user to the shop that owns this access code.
 *
 * The client sends a code and nothing else: it cannot name a shop, cannot pick
 * a role, and cannot influence the membership that comes back. The database
 * resolves the code to a shop, refuses it if the owner has closed the door, and
 * creates the membership as an employee.
 */
export async function redeemAccessCode(
  code: string,
): Promise<{ shopId: string; shopName: string }> {
  const trimmed = code.trim().toUpperCase();
  const { data, error } = await supabase.rpc("redeem_employee_access_code", {
    p_code: trimmed,
  });
  if (error) throw error;

  const result = data as unknown as { shop_id: string; shop_name: string };
  return { shopId: result.shop_id, shopName: result.shop_name };
}

/** Owner switch: whether new staff may join with the access code at all. */
export async function setEmployeeJoining(shopId: string, enabled: boolean): Promise<Shop> {
  const { data, error } = await supabase.rpc("set_employee_joining", {
    p_shop_id: shopId,
    p_enabled: enabled,
  });
  if (error) throw error;
  return data as Shop;
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
 * The shop's member directory: name, role and status per user.
 *
 * A SECURITY DEFINER function that reads `profiles` internally so a member can
 * see a colleague's name without being able to read a colleague's phone number
 * or email. It is the same directory the Employees screen renders and the same
 * one the transaction ledger uses to label who did what.
 */
export async function listMemberDirectory(shopId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc("shop_member_directory", { p_shop_id: shopId });
  if (error) throw error;
  return new Map((data ?? []).map((member) => [member.user_id, member.display_name]));
}

export async function updateMember(
  shopId: string,
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

  const { error } = await supabase
    .from("shop_members")
    .update(update)
    .eq("id", memberId)
    .eq("shop_id", shopId);
  if (error) throw error;
}

export interface AccessCodeRow {
  id: string;
  label: string;
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

export async function listAccessCodes(shopId: string): Promise<AccessCodeRow[]> {
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
 * Mints a till code. The plaintext is returned to the caller to show once — the
 * database stores only a digest, so it cannot be read back later. Generating a
 * new one retires the previous code in the same transaction.
 */
/**
 * True when another shop already holds this code.
 *
 * The database refuses to redeem an ambiguous code, which protects the staff
 * member but still leaves the owner with a code nobody can use. Asking first
 * turns that into a message at the moment they can still fix it.
 */
export async function isAccessCodeTakenElsewhere(code: string): Promise<boolean> {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length < 4) return false;
  const { data, error } = await supabase.rpc("access_code_is_ambiguous", {
    p_code: trimmed,
  });
  if (error) return false;
  return data === true;
}

export async function createAccessCode(shopId: string, code: string): Promise<void> {
  const { error } = await supabase.rpc("create_employee_access_code", {
    p_shop_id: shopId,
    p_label: "Staff access code",
    p_code: code,
  });
  if (error) throw error;
}

export async function regenerateAccessCode(shopId: string, code: string): Promise<void> {
  const { error } = await supabase.rpc("regenerate_employee_access_code", {
    p_shop_id: shopId,
    p_code: code,
  });
  if (error) throw error;
}

/**
 * A readable code the owner can accept or change: six digits, no 0/1 so it is
 * unambiguous when read aloud across a counter, and comfortably above the
 * minimum the database enforces.
 */
export function suggestAccessCode(): string {
  const digits = "23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += digits[Math.floor(Math.random() * digits.length)];
  }
  return out;
}

// ---------------------------------------------------------------- payments

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; hint?: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "mpesa", label: "Mobile money" },
  { value: "card", label: "Card" },
  { value: "credit", label: "Credit", hint: "Owed by the customer" },
];

// ---------------------------------------------------------- shop deletion

/**
 * Everything a shop deletion takes with it, as the database counts it.
 *
 * The list is here rather than in the component because the keys are the RPC's
 * output shape: `shop_deletion_counts` builds this exact object in SQL, and the
 * union below is what stops the UI from asking for a key that does not exist.
 */
export const DELETION_COUNT_KEYS = [
  "sales",
  "sale_items",
  "payments",
  "refunds",
  "refund_items",
  "debtors",
  "debtor_payments",
  "products",
  "categories",
  "inventory_movements",
  "expenses",
  "staff",
  "access_codes",
  "activity_entries",
] as const;

export type DeletionCountKey = (typeof DELETION_COUNT_KEYS)[number];
export type DeletionCounts = Record<DeletionCountKey, number>;

/**
 * The RPC's jsonb into numbers.
 *
 * A missing key is zero rather than `NaN`: the database is the only writer of
 * this object, and a count of zero is the safe reading of a key it did not send.
 * `NaN` in a list of things being destroyed would render as "NaN" on a screen
 * asking someone to confirm the most destructive action in the product.
 */
function readCounts(value: unknown): DeletionCounts {
  const raw = (value ?? {}) as Record<string, unknown>;
  const counts = {} as DeletionCounts;
  for (const key of DELETION_COUNT_KEYS) {
    const n = Number(raw[key]);
    counts[key] = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  }
  return counts;
}

export interface ShopDeletionPreview {
  shopId: string;
  shopName: string;
  createdAt: string;
  counts: DeletionCounts;
  /** Privacy requests that survive the deletion, with their shop link cleared. */
  dataRequestsRetained: number;
}

/**
 * What deleting this shop would destroy, and what would outlive it.
 *
 * Owner-only in the database, before anything is counted — so this is also the
 * check that a staff member's client cannot read a shop's ledger size. It is
 * fetched fresh every time it is asked for and never cached: a stale count here
 * is a count the owner is being asked to confirm a lie about.
 */
export async function shopDeletionPreview(shopId: string): Promise<ShopDeletionPreview> {
  const { data, error } = await supabase.rpc("shop_deletion_preview", { p_shop_id: shopId });
  if (error) throw error;

  const row = data as unknown as {
    shop_id: string;
    shop_name: string;
    created_at: string;
    counts: unknown;
    data_requests_retained: number;
  };

  return {
    shopId: row.shop_id,
    shopName: row.shop_name,
    createdAt: row.created_at,
    counts: readCounts(row.counts),
    dataRequestsRetained: Number(row.data_requests_retained) || 0,
  };
}

export interface ShopDeletionResult {
  shopId: string;
  shopName: string;
  counts: DeletionCounts;
  membersRemoved: number;
  /**
   * Files removed from storage afterwards, or `null` when the count could not be
   * established.
   *
   * `null` rather than `0` on purpose: "nothing was left behind" and "we could
   * not find out" are different answers, and the caller says so.
   */
  filesRemoved: number | null;
}

/**
 * Deletes a shop and everything in it. Owner only, and the database checks that
 * the name typed back is the name it holds.
 *
 * The three guards live in `delete_shop()` rather than here because a client is
 * not a security boundary — everything this function assumes is re-checked
 * server-side against `shops.owner_id`, in one transaction, before a row goes.
 *
 * Files are cleaned up afterwards, and that step is allowed to fail quietly.
 * Storage has no foreign keys, so the shop's logo and product photos are still
 * in the buckets when this function returns; they are unreachable either way,
 * because their policies derive tenancy from a `shops` row that no longer
 * exists. Reporting a storage failure as a failed *deletion* would be a lie —
 * the rows are gone and no retry brings them back — so the caller is told how
 * many files went instead.
 */
export async function deleteShop(
  shopId: string,
  confirmShopName: string,
): Promise<ShopDeletionResult> {
  const { data, error } = await supabase.rpc("delete_shop", {
    p_shop_id: shopId,
    p_confirm_shop_name: confirmShopName,
  });
  if (error) throw error;

  const row = data as unknown as {
    shop_id: string;
    shop_name: string;
    counts: unknown;
    members_removed: number;
  };

  let filesRemoved: number | null = 0;
  try {
    filesRemoved = await removeShopFiles(shopId);
  } catch {
    filesRemoved = null;
  }

  return {
    shopId: row.shop_id,
    shopName: row.shop_name,
    counts: readCounts(row.counts),
    membersRemoved: Number(row.members_removed) || 0,
    filesRemoved,
  };
}
