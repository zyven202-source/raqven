/**
 * SAVO AI — server boundary.
 *
 * One endpoint, three actions:
 *   chat    authenticated conversation with read-only, shop-scoped tools
 *   studio  advertising copy generation (JSON), no shop data needed
 *   status  platform-admin health and usage report (never returns secrets)
 *
 * Security model:
 *   - The caller's Supabase access token is verified against the auth server.
 *   - Business reads use the caller's own client, so RLS applies unchanged.
 *   - The active shop is resolved from `shop_members`, never from the request.
 *   - The Groq key exists only in this process; it is never echoed or logged.
 *   - Every provider request passes a per-account daily quota gate first.
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import {
  chatCompletion,
  groqConfig,
  listModels,
  requireConfig,
  type ChatMessage,
  type ToolCall,
} from "./groq.ts";
import { errorResponse, fail, HttpError, json, readJson, corsPreflight } from "./http.ts";
import { knowledgeBlock, type KnowledgeEntry } from "./knowledge.ts";
import { FOLLOWUP_SYSTEM, studioBrief, STUDIO_SYSTEM, systemPrompt } from "./prompts.ts";
import { executeTool, periodRange, TOOL_DEFINITIONS, type ShopRole, type ToolContext } from "./tools.ts";
import { ashnaCompletion, requireAshnaConfig } from "./ashna.ts";

const MAX_HISTORY_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 2000;
const MAX_TOOL_ROUNDS = 4;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface ChatBody {
  action?: unknown;
  shopId?: unknown;
  messages?: unknown;
  studio?: unknown;
}

function env(name: string, fallback = ""): string {
  return (Deno.env.get(name) ?? fallback).trim();
}

function serverClients(accessToken: string | null): {
  admin: SupabaseClient;
  user: SupabaseClient;
} {
  const url = env("SUPABASE_URL");
  const anonKey = env("SUPABASE_ANON_KEY") || env("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !anonKey || !serviceKey) {
    throw new HttpError(
      "not_configured",
      "SAVO AI is missing its Supabase function configuration.",
      503,
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const user = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: accessToken
      ? { headers: { Authorization: `Bearer ${accessToken}` } }
      : {},
  });

  return { admin, user };
}

async function authenticate(
  admin: SupabaseClient,
  accessToken: string | null,
): Promise<{ id: string; email: string | null }> {
  if (!accessToken) {
    throw new HttpError("unauthorized", "Sign in to use SAVO AI.", 401);
  }
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new HttpError("unauthorized", "Your session has expired. Sign in again.", 401);
  }
  return { id: data.user.id, email: data.user.email ?? null };
}

interface ResolvedShop {
  shopId: string | null;
  role: ShopRole | null;
  shopName: string | null;
  currency: string;
}

async function resolveShop(
  client: SupabaseClient,
  userId: string,
  requested: unknown,
): Promise<ResolvedShop> {
  const shopId = typeof requested === "string" ? requested.trim() : "";
  if (!shopId) return { shopId: null, role: null, shopName: null, currency: "KES" };

  const { data: membership, error } = await client
    .from("shop_members")
    .select("role, status")
    .eq("shop_id", shopId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new HttpError("internal", "Could not check shop access.", 500);
  }
  if (!membership || membership.status !== "active") {
    throw new HttpError("forbidden", "You do not have access to that shop.", 403);
  }

  const { data: shop } = await client
    .from("shops")
    .select("name, currency")
    .eq("id", shopId)
    .maybeSingle();

  return {
    shopId,
    role: membership.role === "owner" ? "owner" : "employee",
    shopName: shop?.name ?? null,
    currency: shop?.currency ?? "KES",
  };
}

function parseTurns(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) {
    throw new HttpError("bad_request", "Messages must be an array.", 400);
  }

  const turns: ChatTurn[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const role = (entry as { role?: unknown }).role;
    const content = (entry as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const trimmed = content.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_MESSAGE_CHARS) {
      throw new HttpError(
        "bad_request",
        `Each message must be under ${MAX_MESSAGE_CHARS} characters.`,
        413,
      );
    }
    turns.push({ role, content: trimmed });
  }

  const bounded = turns.slice(-MAX_HISTORY_MESSAGES);
  if (bounded.length === 0 || bounded[bounded.length - 1]?.role !== "user") {
    throw new HttpError("bad_request", "Send a question to start.", 400);
  }
  return bounded;
}

function nairobiToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function quotaLimits(): { requests: number; tokens: number } {
  const requests = Number(env("AI_DAILY_REQUESTS", "80"));
  const tokens = Number(env("AI_DAILY_TOKENS", "120000"));
  return {
    requests: Number.isFinite(requests) && requests > 0 ? Math.trunc(requests) : 80,
    tokens: Number.isFinite(tokens) && tokens > 0 ? Math.trunc(tokens) : 120000,
  };
}

async function consumeQuota(
  admin: SupabaseClient,
  userId: string,
  input: { requests: number; inputTokens: number; outputTokens: number },
): Promise<{ allowed: boolean; requests: number; request_limit: number }> {
  const limits = quotaLimits();
  const { data, error } = await admin.rpc("ai_consume_quota", {
    p_user_id: userId,
    p_requests: input.requests,
    p_input_tokens: input.inputTokens,
    p_output_tokens: input.outputTokens,
    p_request_limit: limits.requests,
    p_token_limit: limits.tokens,
  });

  if (error) {
    console.error("[savo-ai] quota check failed", error.message);
    // Fail closed on quota: a broken counter must not become unlimited spend.
    throw new HttpError(
      "provider_unavailable",
      "SAVO AI is temporarily unavailable. Try again shortly.",
      503,
    );
  }

  const result = data as { allowed?: boolean; requests?: number; request_limit?: number } | null;
  return {
    allowed: result?.allowed !== false,
    requests: Number(result?.requests ?? 0),
    request_limit: Number(result?.request_limit ?? limits.requests),
  };
}

async function loadKnowledge(admin: SupabaseClient): Promise<KnowledgeEntry[]> {
  const { data, error } = await admin.rpc("ai_knowledge_overrides");
  if (error || !Array.isArray(data)) return [];
  return (data as Array<Record<string, unknown>>).map((row) => ({
    slug: String(row.slug ?? ""),
    title: String(row.title ?? ""),
    body: String(row.body ?? ""),
  }));
}

// ---------------------------------------------------------------------------
// chat
// ---------------------------------------------------------------------------

async function handleChat(input: {
  body: ChatBody;
  admin: SupabaseClient;
  user: SupabaseClient;
  userId: string;
  shop: ResolvedShop;
}): Promise<Response> {
  const { admin, user, userId, shop } = input;
  const config = requireConfig();
  const turns = parseTurns(input.body["messages"]);

  const gate = await consumeQuota(admin, userId, { requests: 1, inputTokens: 0, outputTokens: 0 });
  if (!gate.allowed) {
    return fail(
      "rate_limited",
      `You have used SAVO AI ${gate.requests} times today (limit ${gate.request_limit}). It resets tomorrow.`,
      429,
    );
  }

  const knowledge = knowledgeBlock(await loadKnowledge(admin));
  const context: ToolContext = {
    supabase: user,
    shopId: shop.shopId,
    role: shop.role,
    currency: shop.currency,
    shopName: shop.shopName,
  };

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: systemPrompt({
        shopName: shop.shopName,
        currency: shop.currency,
        role: shop.role,
        knowledge,
        today: nairobiToday(),
      }),
    },
    ...turns.map((turn) => ({ role: turn.role, content: turn.content })),
  ];

  let usageIn = 0;
  let usageOut = 0;
  const usedTools: string[] = [];
  let model = config.model;

  // Without an active shop there is nothing to call, and the tool schemas are
  // pure token cost on a metered tier — so they are only sent when usable.
  const tools = shop.shopId
    ? (TOOL_DEFINITIONS as unknown as Parameters<typeof chatCompletion>[0]["tools"])
    : undefined;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const completion = await chatCompletion({
      apiKey: config.apiKey,
      model: config.model,
      messages,
      ...(tools ? { tools } : {}),
      maxTokens: 800,
      temperature: 0.3,
      timeoutMs: 30_000,
    });

    usageIn += completion.usage.input;
    usageOut += completion.usage.output;
    model = completion.model;

    if (completion.toolCalls.length === 0) {
      await consumeQuota(admin, userId, {
        requests: 0,
        inputTokens: usageIn,
        outputTokens: usageOut,
      });
      return json({
        reply:
          completion.content ||
          "I could not put that into words. Could you ask it a different way?",
        tools: usedTools,
        model,
        usage: { input: usageIn, output: usageOut },
      });
    }

    messages.push({
      role: "assistant",
      content: completion.content,
      tool_calls: completion.toolCalls,
    });

    for (const call of completion.toolCalls) {
      await appendToolResult(messages, call, context, usedTools);
    }

    // The facts are now in the transcript. Swap the long system prompt for the
    // short one so the answering turn fits the same per-minute budget.
    if (messages[0]?.role === "system") {
      messages[0] = { role: "system", content: FOLLOWUP_SYSTEM };
    }
  }

  // The model kept asking for tools. Answer once more with what it already has.
  const final = await chatCompletion({
    apiKey: config.apiKey,
    model: config.model,
    messages,
    maxTokens: 700,
    temperature: 0.3,
    timeoutMs: 30_000,
  });
  usageIn += final.usage.input;
  usageOut += final.usage.output;

  await consumeQuota(admin, userId, {
    requests: 0,
    inputTokens: usageIn,
    outputTokens: usageOut,
  });

  return json({
    reply: final.content || "I could not finish that answer. Try a narrower question.",
    tools: usedTools,
    model: final.model,
    usage: { input: usageIn, output: usageOut },
  });
}

async function appendToolResult(
  messages: ChatMessage[],
  call: ToolCall,
  context: ToolContext,
  usedTools: string[],
): Promise<void> {
  const name = call.function?.name ?? "";
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(call.function?.arguments || "{}");
    if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>;
  } catch {
    args = {};
  }

  let result: Record<string, unknown>;
  try {
    result = await executeTool(name, args, context);
    if (!usedTools.includes(name)) usedTools.push(name);
  } catch (error) {
    result = {
      error:
        error instanceof HttpError
          ? error.message
          : "That information could not be read for this shop.",
    };
    console.error("[savo-ai] tool failed", name, error instanceof Error ? error.message : "");
  }

  messages.push({
    role: "tool",
    tool_call_id: call.id,
    content: JSON.stringify(result).slice(0, 6000),
  });
}

// ---------------------------------------------------------------------------
// studio
// ---------------------------------------------------------------------------

interface StudioInput {
  goal: string;
  audience: string;
  platform: string;
  format: string;
  duration: string;
  tone: string;
  language: string;
  feature: string;
  details: string;
  variation: string;
}

function stringField(source: Record<string, unknown>, key: string, fallback: string): string {
  const value = source[key];
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 400) : fallback;
}

function parseStudio(value: unknown): StudioInput {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    goal: stringField(source, "goal", "Introduce SAVO to shop owners"),
    audience: stringField(source, "audience", "Kenyan shop owners"),
    platform: stringField(source, "platform", "Instagram Reels"),
    format: stringField(source, "format", "Short video script"),
    duration: stringField(source, "duration", "30 seconds"),
    tone: stringField(source, "tone", "Warm and practical"),
    language: stringField(source, "language", "English"),
    feature: stringField(source, "feature", "Point of sale"),
    details: stringField(source, "details", ""),
    variation: stringField(source, "variation", "Original"),
  };
}

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function handleStudio(input: {
  body: ChatBody;
  admin: SupabaseClient;
  userId: string;
}): Promise<Response> {
  const config = requireConfig();
  const brief = parseStudio(input.body["studio"]);

  const gate = await consumeQuota(input.admin, input.userId, {
    requests: 1,
    inputTokens: 0,
    outputTokens: 0,
  });
  if (!gate.allowed) {
    return fail(
      "rate_limited",
      `You have used SAVO AI ${gate.requests} times today (limit ${gate.request_limit}). It resets tomorrow.`,
      429,
    );
  }

  const completion = await chatCompletion({
    apiKey: config.apiKey,
    model: config.model,
    messages: [
      { role: "system", content: STUDIO_SYSTEM },
      { role: "user", content: studioBrief(brief) },
    ],
    maxTokens: 1800,
    temperature: 0.7,
    timeoutMs: 45_000,
  });

  await consumeQuota(input.admin, input.userId, {
    requests: 0,
    inputTokens: completion.usage.input,
    outputTokens: completion.usage.output,
  });

  const parsed = extractJson(completion.content);
  return json({
    studio: parsed ?? {
      format: brief.format,
      title: `${brief.feature} — ${brief.platform}`,
      hook: "",
      scenes: [],
      voiceover: "",
      caption: completion.content,
      hashtags: [],
      cta: "",
      notes: "The model did not return structured JSON, so the draft is shown as text.",
    },
    model: completion.model,
    usage: completion.usage,
  });
}

// ---------------------------------------------------------------------------
// status (platform admin only)
// ---------------------------------------------------------------------------

async function handleStatus(input: {
  user: SupabaseClient;
  userId: string;
  admin: SupabaseClient;
}): Promise<Response> {
  const { data: isAdmin, error: adminError } = await input.user.rpc("is_platform_admin");
  if (adminError) {
    return fail("internal", "Could not verify admin access.", 500);
  }
  if (isAdmin !== true) {
    return fail("forbidden", "Platform admin access is required.", 403);
  }

  const config = groqConfig();
  let availableModels: string[] = [];
  let reachable = false;
  let latencyMs: number | null = null;
  let providerError: string | null = null;

  if (config.configured) {
    const started = Date.now();
    try {
      availableModels = await listModels(config.apiKey);
      reachable = true;
      latencyMs = Date.now() - started;
    } catch (error) {
      providerError =
        error instanceof HttpError ? error.message : "The provider could not be reached.";
      latencyMs = Date.now() - started;
    }
  }

  const limits = quotaLimits();
  // The admin RPC is gated by the caller's own claims, which we already proved.
  const { data: usageReport } = await input.user.rpc("admin_ai_usage", { p_days: 1 });
  const usage = usageReport as
    | { total_requests?: number; total_tokens?: number; accounts_today?: number }
    | null;

  return json({
    provider: "groq",
    configured: config.configured,
    model: config.model || null,
    modelAvailable: config.configured && availableModels.includes(config.model),
    reachable,
    latencyMs,
    providerError,
    availableModels: availableModels.slice(0, 25),
    limits,
    usageToday: {
      requests: Number(usage?.total_requests ?? 0),
      tokens: Number(usage?.total_tokens ?? 0),
      accounts: Number(usage?.accounts_today ?? 0),
    },
  });
}

// ---------------------------------------------------------------------------
// live (the Ashna agent, grounded in this shop's own records)
// ---------------------------------------------------------------------------

/**
 * The reads that make up the snapshot. Each one is an existing tool, so it runs
 * through the caller's own Supabase client and RLS applies exactly as it does
 * in the app — this path cannot widen access. Owner-only figures (costs, profit)
 * are attempted too; a refusal is recorded as unavailable, not as an error.
 */
const LIVE_READS: Array<[string, Record<string, unknown>]> = [
  ["get_shop_profile", {}],
  ["get_sales_summary", { period: "today" }],
  ["get_sales_summary", { period: "7d" }],
  ["get_sales_summary", { period: "30d" }],
  ["get_top_products", { period: "30d" }],
  ["get_expenses_summary", { period: "30d" }],
  ["get_low_stock", {}],
  ["get_debtors", {}],
  ["get_business_overview", {}],
];

async function handleLive(input: {
  body: ChatBody;
  admin: SupabaseClient;
  user: SupabaseClient;
  userId: string;
  shop: ResolvedShop;
}): Promise<Response> {
  const config = requireAshnaConfig();
  const { admin, user, userId, shop } = input;

  if (!shop.shopId) {
    return fail("forbidden", "Open a shop to ask about its figures.", 403);
  }

  const turns = parseTurns(input.body["messages"]);

  // One count per question, sharing the same daily budget as the native chat.
  const gate = await consumeQuota(admin, userId, { requests: 1, inputTokens: 0, outputTokens: 0 });
  if (!gate.allowed) {
    return fail(
      "rate_limited",
      `You have used SAVO AI ${gate.requests} times today (limit ${gate.request_limit}). It resets tomorrow.`,
      429,
    );
  }

  const context: ToolContext = {
    supabase: user,
    shopId: shop.shopId,
    role: shop.role,
    currency: shop.currency,
    shopName: shop.shopName,
  };

  const facts: Record<string, unknown> = {};
  const served: string[] = [];
  for (const [name, args] of LIVE_READS) {
    const key = args["period"] ? `${name}:${String(args["period"])}` : name;
    try {
      facts[key] = await executeTool(name, args, context);
      if (!served.includes(name)) served.push(name);
    } catch (error) {
      facts[key] = {
        unavailable:
          error instanceof HttpError ? error.message : "That figure could not be read.",
      };
    }
  }

  // The snapshot is the agent's only source of figures. Bounded so a large shop
  // cannot blow up the request; the tools already cap their own row counts.
  const snapshot = JSON.stringify(facts).slice(0, 6000);

  const system = [
    `You are SAVO AI inside SAVO, a point-of-sale and record-keeping app for small shops in Kenya, speaking to ${shop.role === "owner" ? "the shop owner" : "shop staff"} of "${shop.shopName ?? "this shop"}".`,
    `Currency: ${shop.currency}. Today in Nairobi: ${nairobiToday()}.`,
    "The JSON below was read seconds ago from this shop's own records under the caller's access. It is the only permitted source of figures.",
    "Answer using those figures only. Name the period you used. Never invent, round up, extrapolate or estimate a number. If something is missing or marked unavailable, say you cannot see it and point to the screen that shows it. Never mention this data block or that you were given data.",
    `LIVE SHOP DATA (JSON):\n${snapshot}`,
  ].join("\n\n");

  const completion = await ashnaCompletion({
    apiKey: config.apiKey,
    agentId: config.agentId,
    messages: [
      { role: "system", content: system },
      ...turns.map((turn) => ({ role: turn.role, content: turn.content })),
    ],
    maxTokens: 800,
    temperature: 0.2,
    timeoutMs: 40_000,
  });

  await consumeQuota(admin, userId, {
    requests: 0,
    inputTokens: completion.usage.input,
    outputTokens: completion.usage.output,
  });

  return json({
    reply:
      completion.content ||
      "I could not put that into words. Try asking a narrower question.",
    tools: served,
    model: completion.model,
    usage: completion.usage,
  });
}

// ---------------------------------------------------------------------------
// entrypoint
// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsPreflight();
  if (req.method !== "POST") return fail("bad_request", "Use POST.", 405);

  try {
    const body = (await readJson(req)) as ChatBody;
    const action = typeof body.action === "string" ? body.action : "chat";

    const header = req.headers.get("Authorization") ?? "";
    const accessToken = header.replace(/^Bearer\s+/i, "").trim() || null;
    if (!accessToken) {
      return fail("unauthorized", "Sign in to use SAVO AI.", 401);
    }

    const clients = serverClients(accessToken);
    const user = await authenticate(clients.admin, accessToken);

    if (action === "status") {
      return await handleStatus({
        user: clients.user,
        admin: clients.admin,
        userId: user.id,
      });
    }

    if (action === "studio") {
      return await handleStudio({
        body,
        admin: clients.admin,
        userId: user.id,
      });
    }

    if (action === "live") {
      const shop = await resolveShop(clients.user, user.id, body["shopId"]);
      return await handleLive({
        body,
        admin: clients.admin,
        user: clients.user,
        userId: user.id,
        shop,
      });
    }

    if (action !== "chat") {
      return fail("bad_request", "Unknown action.", 400);
    }

    const shop = await resolveShop(clients.user, user.id, body["shopId"]);
    return await handleChat({
      body,
      admin: clients.admin,
      user: clients.user,
      userId: user.id,
      shop,
    });
  } catch (error) {
    return errorResponse(error);
  }
});

// Kept for parity with the app's period helper; also documents that only named
// periods are accepted from the model.
void periodRange;
