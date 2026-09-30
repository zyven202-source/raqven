/**
 * Privacy, consent and data-subject requests.
 *
 * Layering note: this is the only place that talks to `consent_records`,
 * `data_requests`, `audit_log` or the deletion RPC. Routes and components go
 * through hooks (`usePrivacy`) so the Supabase client stays behind the service
 * layer, per AGENTS.md.
 *
 * Three things are deliberately absent:
 *
 *  * **No cookie or tracking consent.** RAVQEN runs no analytics, no pixels and
 *    no behavioural SDK (§4 of the readiness pass). A consent toggle for
 *    technology that does not exist is theatre. The only consent recorded is
 *    the terms/privacy acceptance at sign-up and an optional product-updates
 *    switch — and the analytics question is answered in the Privacy Policy
 *    instead: there is nothing to consent to.
 *  * **No marketing consent at sign-up, pre-ticked or otherwise.** Optional
 *    consent that is bundled with the terms checkbox is not optional.
 *  * **No fake "delete everything" button.** `deleteAccount` calls a database
 *    function that refuses while the caller still owns a shop, because a shop's
 *    sales ledger is not the account holder's personal data and deleting it by
 *    accident is not recoverable.
 */
import { supabase } from "@/integrations/supabase/client";
import { POLICY_VERSION } from "@/config/legal";
import type { AuditLogEntry, ConsentRecord, DataRequest, ShopWithRole } from "@/types/ravqen";

export type ConsentType = "terms" | "privacy_policy" | "product_updates";
export type DataRequestType = "access" | "correction" | "deletion" | "privacy_contact";

// -------------------------------------------------------------------- consent

/**
 * Records one consent decision. Append-only: a withdrawal is a new row with
 * `granted = false`, not an update, so the history of what was agreed and when
 * is never rewritten.
 */
export async function recordConsent(
  type: ConsentType,
  granted: boolean,
  source: "signup" | "settings" = "settings",
): Promise<void> {
  const { error } = await supabase.rpc("record_consent", {
    p_consent_type: type,
    p_granted: granted,
    p_policy_version: POLICY_VERSION,
    p_source: source,
  });
  if (error) throw error;
}

export async function listMyConsent(): Promise<ConsentRecord[]> {
  const { data, error } = await supabase
    .from("consent_records")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

/**
 * The current state of each consent type: the most recent row wins.
 * An empty history means nothing has been agreed yet, which is `false` — the
 * safe default, not an assumption.
 */
export function summariseConsent(records: ConsentRecord[]): Record<ConsentType, boolean> {
  const state: Record<ConsentType, boolean> = {
    terms: false,
    privacy_policy: false,
    product_updates: false,
  };
  for (const type of Object.keys(state) as ConsentType[]) {
    const latest = records.find((row) => row.consent_type === type);
    state[type] = latest?.granted ?? false;
  }
  return state;
}

// ------------------------------------------------------------------- requests

export async function lodgeDataRequest(input: {
  type: DataRequestType;
  details?: string | null;
  shopId?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("lodge_data_request", {
    p_request_type: input.type,
    p_details: input.details?.trim() || null,
    p_shop_id: input.shopId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function listMyDataRequests(): Promise<DataRequest[]> {
  const { data, error } = await supabase
    .from("data_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function withdrawDataRequest(requestId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("withdraw_data_request", {
    p_request_id: requestId,
  });
  if (error) throw error;
  return data === true;
}

// ------------------------------------------------------------------- deletion

export interface DeletionOutcome {
  profile_deleted: boolean;
  memberships_removed: number;
  consent_retained: boolean;
}

/**
 * Deletes the signed-in user's personal account data.
 *
 * Refuses — in the database, with the shop names in the error — while the user
 * still owns a shop. Everything else is removed here: profile, memberships,
 * minted access codes, and the link between consent records and the user.
 */
export async function deleteAccount(): Promise<DeletionOutcome> {
  const { data, error } = await supabase.rpc("delete_my_account");
  if (error) throw error;
  const result = data as unknown as DeletionOutcome;
  return {
    profile_deleted: result.profile_deleted === true,
    memberships_removed: Number(result.memberships_removed ?? 0),
    consent_retained: result.consent_retained === true,
  };
}

// --------------------------------------------------------------------- export

export interface PersonalDataExport {
  exported_at: string;
  format: "ravqen-personal-data-export";
  policy_version: string;
  account: Record<string, unknown>;
  shops: { id: string; name: string; role: string; joined_at: string }[];
  membership_count: number;
  consent: ConsentRecord[];
  data_requests: DataRequest[];
  /** What a reader needs to understand a number that is deliberately not here. */
  not_included: string[];
}

/**
 * Builds the complete copy of what RAVQEN holds about the signed-in person.
 *
 * Scope: the account, its profile, the shops it belongs to, its memberships,
 * its consent history and its own requests. It deliberately does **not** dump
 * the shop's ledger — that is the shop's business data, the export for which is
 * the CSV in Reports, and quietly handing every employee a copy of the owner's
 * books would be its own data-protection failure. The `not_included` list says
 * so in the file itself, so a reader is never left guessing.
 */
export async function buildPersonalDataExport(): Promise<PersonalDataExport> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error("You must be signed in.");

  const [profileResult, shopsResult, consentResult, requestsResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    // RLS scopes this to the caller's own shop_members rows, so no `.eq("user_id")`
    // is needed — and adding one would not make it any narrower.
    supabase.from("shop_members").select("id, shop_id, role, status, created_at"),
    supabase.from("consent_records").select("*").order("created_at", { ascending: false }),
    supabase.from("data_requests").select("*").order("created_at", { ascending: false }),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (shopsResult.error) throw shopsResult.error;
  if (consentResult.error) throw consentResult.error;
  if (requestsResult.error) throw requestsResult.error;

  // Fetch the shop names the memberships point at. `shop_members_select`
  // already allows reading a shop you are an active member of; a shop you have
  // been removed from is skipped rather than forced through.
  const memberRows = shopsResult.data ?? [];
  const shopIds = memberRows.filter((row) => row.status === "active").map((row) => row.shop_id);

  const { data: shopRows, error: shopError } = await supabase
    .from("shops")
    .select("id, name")
    .in("id", shopIds.length > 0 ? shopIds : [NO_SHOPS]);
  if (shopError) throw shopError;

  return assemble(
    user.id,
    user.email ?? null,
    profileResult.data,
    memberRows,
    shopRows ?? [],
    consentResult.data ?? [],
    requestsResult.data ?? [],
  );
}

/**
 * `.in()` rejects an empty list, and a person with no shop still runs an
 * export. A well-formed uuid that matches nothing makes the same query legal.
 */
const NO_SHOPS = "00000000-0000-0000-0000-000000000000";

function assemble(
  userId: string,
  email: string | null,
  profile: Record<string, unknown> | null,
  memberRows: { shop_id: string; role: string; status: string; created_at: string }[],
  shopRows: { id: string; name: string }[],
  consent: ConsentRecord[],
  requests: DataRequest[],
): PersonalDataExport {
  const names = new Map(shopRows.map((shop) => [shop.id, shop.name]));

  return {
    exported_at: new Date().toISOString(),
    format: "ravqen-personal-data-export",
    policy_version: POLICY_VERSION,
    account: {
      id: userId,
      email,
      email_confirmed_at: null,
      created_at: null,
      last_sign_in_at: null,
      profile: profile ?? null,
    },
    shops: memberRows
      .filter((row) => row.status === "active")
      .map((row) => ({
        id: row.shop_id,
        name: names.get(row.shop_id) ?? "(no longer a member)",
        role: row.role,
        joined_at: row.created_at,
      })),
    membership_count: memberRows.length,
    consent,
    data_requests: requests,
    not_included: [
      "Your password. It is hashed by the authentication service and is never readable by RAVQEN.",
      "The sales, stock, expense and debtor records of the shops you belong to. Those are the shop's business records, not your personal data — the shop's owner exports them as CSV from the Reports screen.",
      "Files uploaded to a shop (logos, product images, expense receipts). Those belong to the shop.",
      "Records of shops you were removed from. You no longer have access to them.",
    ],
  };
}

/** Triggers a real download in the browser. No server round trip, no email. */
export function downloadJsonFile(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ----------------------------------------------------------------- audit log

/**
 * The shop's activity log. Read-only from here — the table grants no write
 * permission to a signed-in user, so this function is the only thing that can
 * happen to it.
 */
export async function listAuditLog(shopId: string, limit = 100): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export type { AuditLogEntry, ConsentRecord, DataRequest, ShopWithRole };
