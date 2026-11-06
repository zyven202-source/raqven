/**
 * SAVO AI — Groq provider adapter (server-side only).
 *
 * The OpenAI-compatible chat completions endpoint that Groq serves is the only
 * provider surface the rest of the backend knows about. The adapter is the seam
 * where provider-specific behaviour lives: request construction, error mapping,
 * and the shape of a completed response. Everything else in this feature talks
 * to this module, never to `fetch` and a URL directly.
 *
 * Security:
 *  - The API key is read from process.env, never from the request or the client.
 *  - Model names are validated against the configured model before they reach the
 *    provider, so a caller cannot point the assistant at an arbitrary model.
 *  - Response bodies from the provider are treated as untrusted input by the
 *    calling orchestration layer.
 */

const DEFAULT_TIMEOUT_MS = 25_000;

export interface GroqModelConfig {
  /**
   * The model the admin selected as the current assistant model.
   * Empty means "no model configured" rather than "use a default".
   */
  name: string;
  /**
   * A human-readable copy the admin UI can show without exposing the key.
   */
  label: string;
}

export interface GroqRawResponse {
  id: string;
  model: string;
  serviceTier?: string | null;
  object: string;
  created: number;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  } | null;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      refusal?: string | null;
    };
    finishReason: string;
    logprobs?: unknown;
  }>;
}

export class GroqProviderError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
    readonly status?: number,
    readonly providerKind?: "rate_limit" | "auth" | "model" | "server" | "timeout" | "network",
  ) {
    super(message);
    this.name = "GroqProviderError";
  }
}

export function isProviderError(error: unknown): error is GroqProviderError {
  return error instanceof GroqProviderError;
}

/**
 * Reads provider config from the server environment. Missing values are treated
 * as "provider is not configured" rather than as a hard crash, so the backend can
 * return a truthful unavailable state.
 */
export function readGroqConfig() {
  const rawKey = process.env["GROQ_API_KEY"];
  const rawModel = process.env["GROQ_MODEL"];

  const key = rawKey?.trim() || "";
  const model = rawModel?.trim() || "";

  return {
    apiKey: key,
    model: model,
    configured: key.length > 0 && model.length > 0,
  };
}

/**
 * Builds the request body for a single-turn completion.
 *
 * Ids, role names, and the streaming flag are all fixed here. Callers supply the
 * messages; this module decides how the request is shaped.
 */
export function buildChatRequest(args: {
  model: string;
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
  timeoutMs?: number;
}) {
  if (!args.messages.length) {
    throw new Error("Groq request must include at least one message.");
  }
  if (args.maxTokens < 1) {
    throw new Error("Groq request max tokens must be positive.");
  }
  if (args.temperature < 0 || args.temperature > 2) {
    throw new Error("Groq request temperature must be between 0 and 2.");
  }

  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.model}` ? `` : "", // model is not the key; key is passed separately
    },
    body: JSON.stringify({
      model: args.model,
      messages: args.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      max_tokens: args.maxTokens,
      temperature: args.temperature,
      stream: false,
    }),
    timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Validates a message list before it is sent to the provider.
 *
 * We do not send arbitrary chat history. The assistant control plane only allows
 * the message shapes the orchestration layer produces.
 */
export function validateMessages(messages: Array<{ role: string; content: string }>) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("A Groq completion requires at least one message.");
  }

  const allowedRoles = new Set(["system", "user", "assistant", "developer"]);

  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (typeof message !== "object" || message === null) {
      throw new Error(`Groq message at index ${i} is not an object.`);
    }
    if (!allowedRoles.has(message.role)) {
      throw new Error(`Groq message at index ${i} has an unsupported role: ${message.role}.`);
    }
    if (typeof message.content !== "string" || message.content.length === 0) {
      throw new Error(`Groq message at index ${i} must include non-empty text content.`);
    }
    if (message.content.length > MAX_MESSAGE_CHARS) {
      throw new Error(
        `Groq message at index ${i} is too long (${(message.content.length / 1024).toFixed(1)} KB).`,
      );
    }
  }
}

/**
 * Maximum characters allowed in a single Groq message. This is a project safety
 * limit, separate from the provider's own token limits, so we never ship a full
 * shop ledger into the provider.
 */
export const MAX_MESSAGE_CHARS = 12_000;

/**
 * Maximum completion tokens for the assistant. This is a project budget, not a
 * promise about what the provider will honour if it has its own stricter limits.
 */
export const DEFAULT_MAX_TOKENS = 1024;

/**
 * Sends a chat completion request to Groq and returns the raw response object.
 *
 * This is the only place in the assistant that reaches the network for the model.
 * Errors from the provider are mapped to `GroqProviderError` with a stable kind so
 * the admin UI and the assistant UI can react differently to "bad key" versus
 * "provider is busy" versus "model not found".
 */
export async function fetchGroqChat(args: {
  url: string;
  apiKey: string;
  request: ReturnType<typeof buildChatRequest>;
}): Promise<GroqRawResponse> {
  const { url, apiKey, request } = args;
  if (!apiKey) {
    throw new GroqProviderError(
      "SAVO AI is not configured. Ask the platform administrator to set GROQ_API_KEY and GROQ_MODEL.",
      undefined,
      undefined,
      "auth",
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);

  try {
    const response = await fetch(url, {
      method: request.method,
      headers: {
        ...request.headers,
        Authorization: `Bearer ${apiKey}`,
      },
      body: request.body,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (response.ok) {
      const body = (await response.json()) as GroqRawResponse;
      return body;
    }

    return await mapGroqResponseError(response);
  } catch (error) {
    clearTimeout(timer);
    return mapGroqFetchError(error);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Turns a non-2xx Groq response into a typed provider error.
 */
async function mapGroqResponseError(response: Response): Promise<never> {
  const status = response.status;
  let body = "{ unable to read provider body }";
  let parsed: { error?: { message?: string; type?: string } } | null = null;

  try {
    parsed = await response.json() as { error?: { message?: string; type?: string } };
    body = parsed?.error?.message ?? body;
  } catch {
    try {
      body = await response.text();
    } catch {
      /* keep the placeholder */
    }
  }

  const kind = classifyGroqStatus(status, parsed?.error?.type);
  throw new GroqProviderError(`Groq responded with ${status}: ${chop(body)}`, parsed, status, kind);
}

/**
 * Turns a network or timeout failure while calling Groq into a typed provider error.
 */
function mapGroqFetchError(error: unknown): never {
  if (error && typeof error === "object" && "name" in error && error.name === "AbortError") {
    throw new GroqProviderError("SAVO AI took too long to respond from Groq.", error, undefined, "timeout");
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message ?? "");
    const network =
      message.includes("fetch") ||
      message.includes("network") ||
      message.includes("ECONN") ||
      message.includes("ENOTFOUND") ||
      message.includes("EAI_AGAIN") ||
      message.includes("socket") ||
      message.includes("Failed to fetch");

    if (network) {
      throw new GroqProviderError(
        "SAVO AI could not reach Groq. Your connection or the provider may be having issues.",
        error,
        undefined,
        "network",
      );
    }
  }

  throw new GroqProviderError("SAVO AI encountered an error while talking to Groq.", error, undefined, "server");
}

/**
 * Classifies a Groq HTTP status and optional error type into a stable provider kind.
 */
type GroqProviderKind = "rate_limit" | "auth" | "model" | "server" | "timeout" | "network";

function classifyGroqStatus(status: number, providerErrorType?: string | null): GroqProviderKind {
  if (status === 400 || status === 422 || status === 404) {
    return "model";
  }
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limit";
  }
  if (status >= 500) {
    return "server";
  }
  return "server" as GroqProviderKind;
}

/** A readable, stable summary of a provider message, truncated for logs/UI. */
function chop(value: string, limit = 320) {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit)}…` : trimmed;
}
