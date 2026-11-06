/**
 * SAVO AI — server route (backend control plane).
 *
 * This is the server boundary for the assistant. It authenticates the request
 * through the existing Supabase middleware, resolves the caller's active shop from
 * the trusted database relationship, then allows only an explicit, read-only set of
 * tools the assistant may call. It does not let the model talk to the database
 * directly, run SQL, or perform business writes.
 *
 * Public endpoints on this route:
 *  - GET  /api/savo-ai/status        — provider + model + configuration health
 *  - POST /api/savo-ai/chat         — assistant turn, with optional tool calls
 *  - POST /api/savo-ai/studio       — SAVO Studio structured content generation
 *  - POST /api/savo-ai/knowledge    — knowledge-base lookup + snippets
 *
 * Protected endpoints are resolved through the existing `requireSupabaseAuth`
 * middleware. Shop membership is resolved server-side from `shop_members`, never
 * from a client-supplied shop id.
 */

import type { Database } from "@/integrations/supabase/types";
import { createClient } from "@supabase/supabase-js";

import {
  listExpenses,
  listLowStockProducts,
  listMovements,
  listDebtors,
  totalOutstanding,
  listSaleLines,
  listPulseProducts,
  getShopReport,
  firstSaleAt,
} from "@/services/reports.service";
import { listProducts } from "@/services/products.service";
import { listSales } from "@/services/sales.service";
import { listRefunds } from "@/services/refunds.service";
import { listTransactions } from "@/services/transactions.service";
import { listCategories } from "@/services/products.service";
import { getReceiptSettings } from "@/services/receipts.service";
import { getShop } from "@/services/shops.service";
import {
  listMyShops,
  listMemberDirectory,
} from "@/services/shops.service";

import {
  readGroqConfig,
  fetchGroqChat,
  buildChatRequest,
  validateMessages,
  DEFAULT_MAX_TOKENS,
  isProviderError,
  type GroqRawResponse,
} from "@/services/groq.service";

import { knowledgeBase, type KnowledgeEntryKey } from "@/services/ai-knowledge.service";
import { studioPrompt, type StudioRequest, type StudioResponse } from "@/services/ai-studio.service";
import { sanitizeForModel } from "@/services/ai-sanitize.service";

import type { Shop } from "@/types/savo";
import type { ShopRole } from "@/types/savo";

// ---------------------------------------------------------------------------
// Supabase client for this route
// ---------------------------------------------------------------------------

function createRouteSupabaseClient() {
  const SUPABASE_URL = process.env["SUPABASE_URL"];
  const SUPABASE_PUBLISHABLE_KEY = process.env["SUPABASE_PUBLISHABLE_KEY"];

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ["SUPABASE_URL"] : []),
      ...(!SUPABASE_PUBLISHABLE_KEY ? ["SUPABASE_PUBLISHABLE_KEY"] : []),
    ];
    throw new Error(`Missing Supabase environment variable(s): ${missing.join(", ")}.`);
  }

  return createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ---------------------------------------------------------------------------
// Authorization helpers (server-side only, re-checked for every request)
// ---------------------------------------------------------------------------

async function requireAuthenticatedSupabase(request: Request) {
  const client = createRouteSupabaseClient();

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const token = authHeader.slice("Bearer ".length);
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims) {
    throw new Response("Unauthorized", { status: 401 });
  }
  if (!data.claims.sub) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return { client, userId: data.claims.sub };
}

async function requireActiveShop(request: Request) {
  const { client, userId } = await requireAuthenticatedSupabase(request);

  const { data: memberships, error: membershipsError } = await client
    .from("shop_members")
    .select("shop_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1);

  if (membershipsError || !memberships?.length) {
    throw new Response("Unauthorized: no active shop membership", { status: 403 });
  }

  const membership = memberships[0]!;
  const shopId = membership.shop_id;

  const { data: shop, error: shopError } = await client
    .from("shops")
    .select("*")
    .eq("id", shopId)
    .single();

  if (shopError || !shop) {
    throw new Response("Unauthorized: shop not found", { status: 403 });
  }

  return { client, userId, shopId, shop, role: membership.role };
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// Chat and Studio server actions
// ---------------------------------------------------------------------------

type ChatRequest = {
  prompt: string;
  mode?: "chat" | "studio";
};

type ChatResponse =
  | { ok: true; reply: string; model: string; usage?: { promptTokens: number; completionTokens: number } | null }
  | { ok: false; error: { type: string; message: string; configured?: boolean; model?: string } };

async function handleChat(request: Request): Promise<ChatResponse> {
  const shopContext = await requireActiveShop(request);
  const { shopId, userId, shop, role } = shopContext;

  let body: ChatRequest;
  try {
    body = await request.json();
  } catch {
    return { ok: false, error: { type: "invalid_request", message: "Request body must be JSON." } };
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return { ok: false, error: { type: "invalid_request", message: "A message is required." } };
  }
  if (prompt.length > 2000) {
    return { ok: false, error: { type: "invalid_request", message: "A message is too long." } };
  }

  const mode = body.mode === "studio" ? "studio" : "chat";
  const systemPrompt = mode === "studio"
    ? studioPrompt.systemPromptForShop(shop, role)
    : defaultSystemPrompt(shop, role);

  const messages = buildChatMessages({
    prompt,
    mode,
    shop,
    role,
    systemPrompt,
    shopId,
    userId,
    request,
  });

  const providerConfig = readGroqConfig();
  if (!providerConfig.configured) {
    return {
      ok: false,
      error: {
        type: "provider_unavailable",
        message: "SAVO AI is not configured. Ask the platform administrator to set GROQ_API_KEY and GROQ_MODEL.",
        configured: false,
      },
    };
  }

  const requestBody = buildChatRequest({
    model: providerConfig.model,
    messages,
    maxTokens: DEFAULT_MAX_TOKENS,
    temperature: mode === "studio" ? 0.2 : 0.3,
  });

  const providerUrl = "https://api.groq.com/openai/v1/chat/completions";
  let providerResponse: GroqRawResponse;
  try {
    providerResponse = await fetchGroqChat({
      url: providerUrl,
      apiKey: providerConfig.apiKey,
      request: requestBody,
    });
  } catch (error) {
    if (isProviderError(error)) {
      return {
        ok: false,
        error: {
          type: error.providerKind || "server",
          message: error.message,
          configured: true,
        },
      };
    }
    return {
      ok: false,
      error: {
        type: "server",
        message: "SAVO AI encountered an error. Please try again.",
        configured: true,
      },
    };
  }

  const choice = providerResponse.choices?.[0];
  if (!choice?.message?.content) {
    return {
      ok: false,
      error: {
        type: "provider_unavailable",
        message: "SAVO AI returned an empty response.",
        configured: true,
        model: providerConfig.model,
      },
    };
  }

  const assistantMessage = sanitizeForModel(choice.message.content);
  const usage = providerResponse.usage
    ? {
        promptTokens: providerResponse.usage.prompt_tokens,
        completionTokens: providerResponse.usage.completion_tokens,
      }
    : null;

  return {
    ok: true,
    reply: assistantMessage,
    model: providerConfig.model,
    usage,
  };
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const providerConfig = readGroqConfig();

  return new Response(
    JSON.stringify({
      service: "savo-ai",
      configured: providerConfig.configured,
      model: providerConfig.model,
      provider: "groq",
      providerUrl: "https://api.groq.com/openai/v1",
      timestamp: new Date().toISOString(),
    }),
    {
      headers: { "Content-Type": "application/json" },
    },
  );
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path.endsWith("/status") || path === "/api/savo-ai/status") {
    return GET(request);
  }

  if (path.endsWith("/chat") || path === "/api/savo-ai/chat") {
    const result = await handleChat(request);
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (path.endsWith("/studio") || path === "/api/savo-ai/studio") {
    const shopContext = await requireActiveShop(request);
    const { shopId, userId } = shopContext;

    let input: StudioRequest;
    try {
      input = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: { type: "invalid_request", message: "Request body must be JSON." } }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
    if (!prompt) {
      return new Response(JSON.stringify({ error: { type: "invalid_request", message: "A request is required." } }), {
        headers: { "Content-Type": "application/json" },
        status: 400,
      });
    }

    const providerConfig = readGroqConfig();
    if (!providerConfig.configured) {
      return new Response(JSON.stringify({
        error: {
          type: "provider_unavailable",
          message: "SAVO AI is not configured. Ask the platform administrator to set GROQ_API_KEY and GROQ_MODEL.",
          configured: false,
        },
      }), {
        headers: { "Content-Type": "application/json" },
        status: 503,
      });
    }

    const systemPrompt = studioPrompt.systemPromptForShop(shopContext.shop, shopContext.role);
    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ];

    const requestBody = buildChatRequest({
      model: providerConfig.model,
      messages,
      maxTokens: 2048,
      temperature: 0.2,
    });

    const providerUrl = "https://api.groq.com/openai/v1/chat/completions";
    let providerResponse: GroqRawResponse;
    try {
      providerResponse = await fetchGroqChat({
        url: providerUrl,
        apiKey: providerConfig.apiKey,
        request: requestBody,
      });
    } catch (error) {
      if (isProviderError(error)) {
        return new Response(JSON.stringify({
          error: {
            type: error.providerKind || "server",
            message: error.message,
            configured: true,
          },
        }), {
          headers: { "Content-Type": "application/json" },
          status: error.providerKind === "rate_limit" ? 429 : 502,
        });
      }
      return new Response(JSON.stringify({
        error: {
          type: "server",
          message: "SAVO AI encountered an error.",
          configured: true,
        },
      }), {
        headers: { "Content-Type": "application/json" },
        status: 502,
      });
    }

    const choice = providerResponse.choices?.[0];
    if (!choice?.message?.content) {
      return new Response(JSON.stringify({
        error: {
          type: "provider_unavailable",
          message: "SAVO AI returned an empty response.",
          configured: true,
          model: providerConfig.model,
        },
      }), {
        headers: { "Content-Type": "application/json" },
        status: 502,
      });
    }

    const content = sanitizeForModel(choice.message.content);

    let structured: StudioResponse["structured"] | null = null;
    try {
      structured = studioPrompt.parseStructuredOutput(content);
    } catch {
      structured = null;
    }

    return new Response(JSON.stringify({
      ok: true,
      reply: content,
      model: providerConfig.model,
      structured,
      usage: providerResponse.usage
        ? {
            promptTokens: providerResponse.usage.prompt_tokens,
            completionTokens: providerResponse.usage.completion_tokens,
          }
        : null,
    }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (path.endsWith("/knowledge") || path === "/api/savo-ai/knowledge") {
    const shopContext = await requireActiveShop(request);

    const url = new URL(request.url);
    const keyParam = url.searchParams.get("key");

    if (keyParam && knowledgeBase[keyParam as KnowledgeEntryKey]) {
      const entry = knowledgeBase[keyParam as KnowledgeEntryKey];
      return new Response(JSON.stringify({ ok: true, entry }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let body: { query?: string } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const query = (typeof body.query === "string" ? body.query.trim() : "").toLowerCase();
    const matches = Object.entries(knowledgeBase)
      .filter(([, entry]) => {
        if (!query) return true;
        return entry.title.toLowerCase().includes(query) || entry.snippet.toLowerCase().includes(query);
      })
      .map(([key, entry]) => ({
        key: key as KnowledgeEntryKey,
        title: entry.title,
        snippet: entry.snippet,
      }));

    return new Response(JSON.stringify({ ok: true, matches }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: { type: "not_found", message: "Unknown SAVO AI endpoint." } }), {
    headers: { "Content-Type": "application/json" },
    status: 404,
  });
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function defaultSystemPrompt(shop: Shop, role: ShopRole): string {
  return `You are SAVO AI, the intelligent assistant and mascot of SAVO, a Kenyan retail management app for small shops.

You are friendly, practical, and concise. You help a shop owner or employee understand SAVO and their recorded business data. You speak plainly, in English or Swahili where useful, and you do not invent figures.

The current shop:
- Name: ${sanitizeForModel(shop.name)}
- Role of the current user: ${sanitizeForModel(role)}

IMPORTANT RULES:
- Only answer using the data you receive from the tools.
- If a question is about the shop's numbers, use the tools; do not guess.
- If the shop has no matching data, say so plainly.
- Never claim profit from revenue, or revenue from payments, unless the tool output supports it.
- If the user asks you to change, delete, refund, or approve anything, say you cannot do that directly and point them to the right screen.
`;
}

function buildChatMessages(args: {
  prompt: string;
  mode: "chat" | "studio";
  shop: Shop;
  role: ShopRole;
  systemPrompt: string;
  shopId: string;
  userId: string;
  request: Request;
}): Array<{ role: string; content: string }> {
  const { prompt, mode, shop, role, systemPrompt, shopId, userId, request } = args;

  const historyLimit = mode === "studio" ? 0 : 6;
  const history = buildShortChatHistory({
    shopId,
    userId,
    request,
    limit: historyLimit,
  });

  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: prompt },
  ];

  if (messages.length > 20) {
    messages.splice(1, messages.length - 18);
  }

  validateMessages(messages);

  return messages;
}

type ChatHistoryRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

async function buildShortChatHistory(args: {
  shopId: string;
  userId: string;
  request: Request;
  limit: number;
}): Promise<Array<{ role: string; content: string }>> {
  const { shopId, userId, request, limit } = args;

  const client = createRouteSupabaseClient();
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return [];
  }

  const token = authHeader.slice("Bearer ".length);
  const { data: claims, error: claimsError } = await client.auth.getClaims(token);
  if (claimsError || !claims?.sub) {
    return [];
  }
  if (claims.sub !== userId) {
    return [];
  }

  const { data, error } = await client
    .from("savo_ai_messages")
    .select("id, role, content, created_at")
    .eq("shop_id", shopId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    return [];
  }

  return (data ?? []).map((row) => ({
    role: row.role,
    content: row.content,
  }));
}
