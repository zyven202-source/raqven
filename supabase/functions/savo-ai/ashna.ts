/**
 * Ashna provider adapter.
 *
 * The second model provider in SAVO AI, and the reason it exists: the Ashna
 * agent is the assistant people actually talk to, but it runs on Ashna's
 * servers and cannot read this Supabase. So the function reads the shop under
 * the caller's own RLS and passes the figures *into* the agent as context,
 * rather than granting the agent any access of its own.
 *
 * Ashna's HTTP API is OpenAI-compatible:
 *   base   https://api.ashna.ai/v1/api
 *   POST   /chat/completions
 *   auth   Authorization: Bearer <key>
 *   model  the agent's customAgentId slug (or `agent_id` when model is omitted)
 *
 * The key and the slug are read from the server environment, never from the
 * request, and never logged. A missing pair is "not configured" — an honest 503,
 * not a crash and not a silent fallback to another provider.
 */
import { HttpError } from "./http.ts";

const API_BASE = "https://api.ashna.ai/v1/api";

export interface AshnaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AshnaCompletion {
  content: string;
  model: string;
  usage: { input: number; output: number };
}

export function ashnaConfig(): {
  apiKey: string;
  agentId: string;
  configured: boolean;
} {
  const apiKey = (Deno.env.get("ASHNA_API_KEY") ?? "").trim();
  const agentId = (Deno.env.get("ASHNA_AGENT_ID") ?? "").trim();
  return { apiKey, agentId, configured: apiKey.length > 0 && agentId.length > 0 };
}

export function requireAshnaConfig(): { apiKey: string; agentId: string } {
  const config = ashnaConfig();
  if (!config.configured) {
    throw new HttpError(
      "not_configured",
      "SAVO AI is not connected to its Ashna agent. ASHNA_API_KEY and ASHNA_AGENT_ID must be set on the server.",
      503,
    );
  }
  return { apiKey: config.apiKey, agentId: config.agentId };
}

/**
 * One grounded turn. `messages` carries the system message that holds the shop
 * snapshot, so the agent answers with real figures instead of guessing.
 */
export async function ashnaCompletion(args: {
  apiKey: string;
  agentId: string;
  messages: AshnaMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<AshnaCompletion> {
  if (args.messages.length === 0) {
    throw new HttpError("bad_request", "A question is required.", 400);
  }

  const body: Record<string, unknown> = {
    model: args.agentId,
    messages: args.messages,
    max_tokens: Math.min(Math.max(args.maxTokens ?? 800, 64), 4096),
    temperature: Math.min(Math.max(args.temperature ?? 0.2, 0), 1.5),
    stream: false,
  };

  const response = await fetchWithTimeout(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: args.timeoutMs ?? 40_000,
  });

  if (!response.ok) throw await mapError(response);

  const payload = (await response.json()) as {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const content = (payload.choices?.[0]?.message?.content ?? "").trim();
  return {
    content,
    model: payload.model ?? args.agentId,
    usage: {
      input: payload.usage?.prompt_tokens ?? 0,
      output: payload.usage?.completion_tokens ?? 0,
    },
  };
}

async function fetchWithTimeout(
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; timeoutMs: number },
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs);
  try {
    return await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
      throw new HttpError("timeout", "SAVO AI took too long to answer. Try again.", 504);
    }
    throw new HttpError(
      "provider_unavailable",
      "SAVO AI could not reach its agent. Check the connection and try again.",
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Maps an Ashna error response onto the app's own stable error codes. */
async function mapError(response: Response): Promise<HttpError> {
  const status = response.status;
  let detail = "";
  try {
    const body = (await response.json()) as { error?: { message?: string; code?: string } };
    detail = body.error?.message ?? "";
  } catch {
    /* Non-JSON error body: the status is the only fact available. */
  }
  const short = detail.replace(/\s+/g, " ").trim().slice(0, 200);

  if (status === 401 || status === 403) {
    return new HttpError("provider_auth", "The assistant's key was rejected by its provider.", 502);
  }
  if (status === 400 || status === 404 || status === 422) {
    return new HttpError(
      "provider_model",
      short || "The assistant's agent could not be found on that account.",
      502,
    );
  }
  if (status === 429) {
    return new HttpError("provider_unavailable", "The assistant is busy. Try again shortly.", 429);
  }
  return new HttpError("provider_unavailable", "The assistant is having trouble. Try again shortly.", 502);
}
