/**
 * Platform analytics + platform administrator data access.
 *
 * Everything here is an RPC, not a table query. The telemetry tables live in the
 * `analytics` schema, which is not exposed to the browser at all; the admin reads
 * are SECURITY DEFINER functions that re-check the caller against
 * `app.platform_admins` on every call. Nothing in this module grants a client
 * access it did not already have — if the database refuses, the error surfaces.
 *
 * The event names below mirror `app.analytics_event_names`. A name that is not
 * in that table is dropped by the database, so a typo records nothing rather
 * than polluting the stream.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type AnalyticsPlatform = "web" | "android" | "ios";

/** Safe, allowlisted property keys. Anything else is discarded server-side. */
export type AnalyticsProperties = Record<string, string | number | boolean>;

export const ANALYTICS_EVENTS = {
  appOpened: "app_opened",
  screenViewed: "screen_viewed",
  accountRegistered: "account_registered",
  loginSuccess: "login_success",
  logout: "logout",
  passwordResetRequested: "password_reset_requested",
  accountDeleted: "account_deleted",
  shopCreated: "shop_created",
  shopUpdated: "shop_updated",
  shopLogoUpdated: "shop_logo_updated",
  employeeJoined: "employee_joined",
  transactionCompleted: "transaction_completed",
  transactionCancelled: "transaction_cancelled",
  receiptGenerated: "receipt_generated",
  refundCreated: "refund_created",
  productCreated: "product_created",
  productUpdated: "product_updated",
  productArchived: "product_archived",
  stockAdded: "stock_added",
  stockAdjusted: "stock_adjusted",
  lowStockDetected: "low_stock_detected",
  expenseCreated: "expense_created",
  expenseUpdated: "expense_updated",
  expenseDeleted: "expense_deleted",
  debtorRecordCreated: "debtor_record_created",
  debtorPaymentRecorded: "debtor_payment_recorded",
  debtorReminderInitiated: "debtor_reminder_initiated",
  reportExported: "report_exported",
  smartInsightViewed: "smart_insight_viewed",
  activityLogViewed: "activity_log_viewed",
  settingsUpdated: "settings_updated",
  dataExportRequested: "data_export_requested",
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

export async function startAnalyticsSession(input: {
  visitorId: string;
  platform?: AnalyticsPlatform | undefined;
  device?: string | undefined;
  appVersion?: string | undefined;
}): Promise<string | null> {
  const { data, error } = await supabase.rpc("analytics_start_session", {
    p_visitor_id: input.visitorId,
    p_platform: input.platform ?? "web",
    ...(input.device ? { p_device: input.device } : {}),
    ...(input.appVersion ? { p_app_version: input.appVersion } : {}),
  });
  if (error) throw error;
  return typeof data === "string" ? data : null;
}

export async function trackAnalyticsEvent(input: {
  sessionId: string;
  eventName: AnalyticsEventName;
  shopId?: string | undefined;
  properties?: AnalyticsProperties | undefined;
}): Promise<boolean> {
  const { data, error } = await supabase.rpc("analytics_track_event", {
    p_session_id: input.sessionId,
    p_event_name: input.eventName,
    ...(input.shopId ? { p_shop_id: input.shopId } : {}),
    ...(input.properties ? { p_props: input.properties as Json } : {}),
  });
  if (error) throw error;
  return data === true;
}

export async function endAnalyticsSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc("analytics_end_session", { p_session_id: sessionId });
  if (error) throw error;
}

export async function recordAnalyticsError(input: {
  sessionId: string | null;
  severity: "warning" | "error" | "fatal";
  category: string;
  message: string;
  route?: string | undefined;
}): Promise<void> {
  if (!input.sessionId) return;
  const { error } = await supabase.rpc("analytics_record_error", {
    p_session_id: input.sessionId,
    p_severity: input.severity,
    p_category: input.category,
    p_message: input.message,
    ...(input.route ? { p_route: input.route } : {}),
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------

export interface AdminOverview {
  from: string;
  to: string;
  users: {
    total: number;
    new_today: number;
    new_7d: number;
    new_30d: number;
    new_in_range: number;
  };
  shops: { total: number; active: number; new_in_range: number; selling: number };
  audience: {
    visits: number;
    unique_visitors: number;
    new_visitors: number;
    returning_visitors: number;
    screens_viewed: number;
    avg_session_seconds: number;
  };
  active_users: { dau: number; wau: number; mau: number; in_range: number };
  business: {
    sales_count: number;
    sales_total: number;
    refunds_count: number;
    expenses_total: number;
    debtor_payments_total: number;
    products_created: number;
    stock_moves: number;
    debtors_created: number;
    expenses_count: number;
  };
  events: {
    total: number;
    by_name: Array<{
      event: string;
      label: string;
      category: string;
      count: number;
      users: number;
    }>;
    by_category: Array<{ category: string; count: number }>;
  };
  screens: Array<{ route: string; views: number }>;
  daily: Array<{
    day: string;
    visits: number;
    visitors: number;
    events: number;
    sales: number;
    signups: number;
  }>;
}

export interface AdminActivityRow {
  id: string;
  occurred_at: string;
  event: string;
  title: string;
  category: string;
  actor: string | null;
  shop: string | null;
  route: string | null;
  details: Record<string, unknown> | null;
}

export interface AdminActivityPage {
  total: number;
  rows: AdminActivityRow[];
}

export interface AdminErrorRow {
  id: string;
  occurred_at: string;
  severity: "warning" | "error" | "fatal";
  category: string;
  message: string;
  route: string | null;
  app_version: string | null;
  actor: string | null;
}

export interface AdminErrorPage {
  total: number;
  rows: AdminErrorRow[];
}

/** Answers "may this account open the platform console?" without trusting metadata. */
export async function fetchIsPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) return false;
  return data === true;
}

export async function fetchAdminOverview(from: string, to: string): Promise<AdminOverview> {
  const { data, error } = await supabase.rpc("admin_analytics_overview", {
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  if (!data) throw new Error("Analytics returned no data for this range.");
  return data as unknown as AdminOverview;
}

export async function fetchAdminActivity(input: {
  limit?: number | undefined;
  offset?: number | undefined;
  eventNames?: string[] | undefined;
  search?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}): Promise<AdminActivityPage> {
  const { data, error } = await supabase.rpc("admin_activity_feed", {
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
    ...(input.eventNames && input.eventNames.length > 0
      ? { p_event_names: input.eventNames }
      : {}),
    ...(input.search ? { p_search: input.search } : {}),
    ...(input.from ? { p_from: input.from } : {}),
    ...(input.to ? { p_to: input.to } : {}),
  });
  if (error) throw error;
  return (data as unknown as AdminActivityPage) ?? { total: 0, rows: [] };
}

export async function fetchAdminErrors(input: {
  limit?: number | undefined;
  offset?: number | undefined;
  severity?: string | undefined;
  category?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}): Promise<AdminErrorPage> {
  const { data, error } = await supabase.rpc("admin_error_feed", {
    p_limit: input.limit ?? 50,
    p_offset: input.offset ?? 0,
    ...(input.severity ? { p_severity: input.severity } : {}),
    ...(input.category ? { p_category: input.category } : {}),
    ...(input.from ? { p_from: input.from } : {}),
    ...(input.to ? { p_to: input.to } : {}),
  });
  if (error) throw error;
  return (data as unknown as AdminErrorPage) ?? { total: 0, rows: [] };
}

export async function fetchAdminActivityCsv(input: {
  from: string;
  to: string;
  eventNames?: string[] | undefined;
}): Promise<string> {
  const { data, error } = await supabase.rpc("admin_export_activity_csv", {
    p_from: input.from,
    p_to: input.to,
    ...(input.eventNames && input.eventNames.length > 0
      ? { p_event_names: input.eventNames }
      : {}),
  });
  if (error) throw error;
  return typeof data === "string" ? data : "";
}
