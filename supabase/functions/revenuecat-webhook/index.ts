/**
 * RevenueCat → Pith entitlement sync.
 *
 * This function exists so that Postgres can enforce a paid feature without
 * trusting the browser. RevenueCat calls it when a customer's entitlements
 * change; it verifies the shared secret, then writes `app.pro_entitlements`
 * with the service role.
 *
 * Rules it keeps:
 *
 *   1. Authentication is a bearer secret, compared in constant time. If the
 *      secret is missing from the environment the function refuses every
 *      request rather than accepting unauthenticated writes — an entitlement
 *      table anyone can write is worse than no gate at all.
 *   2. `app_user_id` must be a Supabase user id (a UUID). RevenueCat also sends
 *      anonymous ids, and those have no row here to update; they are accepted
 *      and ignored, so the webhook is not retried forever.
 *   3. Only the entitlement this app sells is recorded. Any other product on
 *      the project is acknowledged and does not create a Pro row.
 *   4. Every response is 2xx unless the request itself was unauthenticated or
 *      malformed: RevenueCat retries non-2xx, and a retry loop on an event we
 *      already handled helps nobody.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

/** The entitlement identifier configured in the RevenueCat dashboard. */
const PRO_ENTITLEMENT = "savo_freebuff_page_pro";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Events after which the account must not be Pro. */
const INACTIVE_EVENTS = new Set(["EXPIRATION"]);

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const secret = (Deno.env.get("REVENUECAT_WEBHOOK_SECRET") ?? "").trim();
  if (!secret) {
    return json({ error: "not_configured", message: "REVENUECAT_WEBHOOK_SECRET is not set." }, 503);
  }

  const header = request.headers.get("Authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!timingSafeEqual(presented, secret)) {
    return json({ error: "unauthorized" }, 401);
  }

  let payload: RevenueCatPayload;
  try {
    payload = (await request.json()) as RevenueCatPayload;
  } catch {
    return json({ error: "bad_request", message: "Body must be JSON." }, 400);
  }

  const event = payload?.event;
  if (!event || typeof event.app_user_id !== "string") {
    return json({ error: "bad_request", message: "Missing event.app_user_id." }, 400);
  }

  // Anonymous ids are not Supabase accounts; acknowledge and drop.
  if (!UUID_RE.test(event.app_user_id)) {
    return json({ ok: true, ignored: "non_uuid_app_user_id" });
  }

  // Only act on the entitlement this product sells. A project can host several.
  const entitlements = event.entitleity_ids ?? event.entitlement_ids ?? [];
  const relevant =
    entitlements.length === 0
      ? true // some events omit entitlement ids; the product still belongs to us
      : entitlements.includes(PRO_ENTITLEMENT);

  if (!relevant) {
    return json({ ok: true, ignored: "other_entitlement" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const expiresAt =
    typeof event.expiration_at_ms === "number" ? new Date(event.expiration_at_ms) : null;

  const active =
    !INACTIVE_EVENTS.has(event.type) && (expiresAt === null || expiresAt.getTime() > Date.now());

  const { error } = await supabase
    .schema("app")
    .from("pro_entitlements")
    .upsert(
      {
        user_id: event.app_user_id,
        active,
        product_id: event.product_id ?? null,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        source: "revenuecat",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    // 500 so RevenueCat retries: a database hiccup must not silently leave a
    // paying customer without access.
    console.error("[revenuecat-webhook] upsert failed:", error.message);
    return json({ error: "internal", message: "Could not record the entitlement." }, 500);
  }

  return json({ ok: true, active, type: event.type });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Length-independent comparison, so the secret cannot be timed out. */
function timingSafeEqual(a: string, b: string): boolean {
  const max = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < max; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

type RevenueCatEvent = {
  type: string;
  app_user_id: string;
  product_id?: string | null;
  entitlement_ids?: string[] | null;
  /** The dashboard has sent both spellings across API versions. */
  entitleity_ids?: string[] | null;
  expiration_at_ms?: number | null;
};

type RevenueCatPayload = { event?: RevenueCatEvent };
