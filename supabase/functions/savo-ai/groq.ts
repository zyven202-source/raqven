/**
 * Groq provider adapter.
 *
 * The only module in SAVO AI that talks to the model provider. Everything else
 * deals in messages and results, which keeps the provider swappable and keeps
 * the key in exactly one place: `process.env.GROQ_API_KEY`, read on the server.
 *
 * The model is never assumed. `GROQ_MODEL` names it, and `listModels()` asks the
 * account what it can actually run, so a model that is retired or not enabled
 * produces an honest "this model is not available" instead of a mystery 404.
 */
import { HttpError } from "./http.ts";

const API_BASE = "https://api.groq.com/openai/v1";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ProviderUsage {
  input: number;
  output: number;
}

export interface Completion {
  content: string;
  toolCalls: ToolCall[];
  usage: ProviderUsage;
  model: string;
}

export function groqConfig(): { apiKey: string; model: string; configured: boolean } {
  const apiKey = (Deno.env.get("GROQ_API_KEY") ?? "").trim();
  const model = (Deno.env.get("GROQ_MODEL") ?? "").trim();
  return { apiKey, model, configured: apiKey.length > 0 && model.length > 0 };
}

export function requireConfig(): { apiKey: string; model: string } {
  const config = groqConfig();
  if (!config.configured) {
    throw new HttpError(
      "not_configured",
      "SAVO AI is not configured. GROQ_API_KEY and GROQ_MODEL must be set on the server.",
      503,
    );
  }
  return { apiKey: config.apiKey, model: config.model };
}

export async function listModels(apiKey: string, timeoutMs = 10_000): Promise<string[]> {
  const response = await fetchWithTimeout(`${API_BASE}/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
    timeoutMs,
  });
  if (!response.ok) throw await mapError(response);
  const body = (await response.json()) as { data?: Array<{ id?: string }> };
  return (body.data ?? []).map((entry) => entry.id ?? "").filter(Boolean);
}

export async function chatCompletion(args: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<Completion> {
  const body: Record<string, unknown> = {
    model: args.model,
    messages: args.messages,
    max_tokens: Math.min(Math.max(args.maxTokens ?? 800, 64), 4096),
    temperature: Math.min(Math.max(args.temperature ?? 0.3, 0), 1.5),
    stream: false,
  };
  if (args.tools && args.tools.length > 0) {
    body["tools"] = args.tools;
    body["tool_choice"] = "auto";
  }

  const response = await fetchWithTimeout(`${API_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: args.timeoutMs ?? 30_000,
  });

  if (!response.ok) throw await mapError(response);

  const payload = (await response.json()) as {
    model?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: ToolCall[];
      };
    }>;
  };

  const message = payload.choices?.[0]?.message;
  return {
    content: (message?.content ?? "").trim(),
    toolCalls: Array.isArray(message?.tool_calls) ? message.tool_calls : [],
    usage: {
      input: payload.usage?.prompt_tokens ?? 0,
      output: payload.usage?.completion_tokens ?? 0,
    },
    model: payload.model ?? args.model,
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
      ...(init.body ? { body: init.body } : {}),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError("timeout", "Groq took too long to answer. Try again.", 504);
    }
    throw new HttpError(
      "provider_unavailable",
      "SAVO AI could not reach Groq. Check the connection and try again.",
      502,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function mapError(response: Response): Promise<HttpError> {
  let detail = "";
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    detail = body.error?.message ?? "";
  } catch {
    /* the status alone is still useful */
  }
  const short = detail.replace(/\s+/g, " ").slice(0, 240);

  if (response.status === 401 || response.status === 403) {
    return new HttpError("provider_auth", "Groq rejected the server's API key.", 502);
  }
  if (response.status === 404 || response.status === 400) {
    return new HttpError(
      "provider_model",
      short || "That model is not available on this Groq account.",
      502,
    );
  }
  if (response.status === 429) {
    // Be specific rather than vague: on the free tier this is a per-minute token
    // ceiling, so "wait a moment" would be misleading.
    const retryAfter = Number(response.headers.get("retry-after") ?? "0");
    const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 0;
    return new HttpError(
      "rate_limited",
      seconds > 0
        ? `SAVO AI has reached its per-minute limit. Try again in about ${seconds} seconds.`
        : "SAVO AI has reached its per-minute limit. Wait about a minute and try again.",
      429,
    );
  }
  if (response.status >= 500) {
    return new HttpError("provider_unavailable", "Groq is having trouble. Try again shortly.", 502);
  }
  return new HttpError("provider_unavailable", short || "The model request failed.", 502);
}
