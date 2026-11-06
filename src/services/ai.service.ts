/**
 * SAVO AI data access.
 *
 * The browser never talks to Groq. It calls one Supabase Edge Function
 * (`savo-ai`), which verifies the caller's access token, resolves the active
 * shop from `shop_members` and performs every business read under that user's
 * own RLS. This module is the only place the app names that function, so the
 * provider stays swappable without touching a component.
 *
 * Nothing here is cached or persisted server-side beyond a daily request
 * counter: conversations live in the tab's session storage and disappear when
 * it closes, and they are keyed per account and per shop.
 */
import { supabase } from "@/integrations/supabase/client";

export type AiChatTurn = { role: "user" | "assistant"; content: string };

export type AiUsage = { input: number; output: number };

export type AiReply = {
  reply: string;
  tools: string[];
  model: string | null;
  usage?: AiUsage;
};

export type AiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "bad_request"
  | "not_configured"
  | "rate_limited"
  | "provider_auth"
  | "provider_model"
  | "provider_unavailable"
  | "timeout"
  | "internal"
  | "network";

/** A failure the panel can explain, with the server's own code when it sent one. */
export class AiError extends Error {
  constructor(
    message: string,
    readonly code: AiErrorCode,
  ) {
    super(message);
    this.name = "AiError";
  }
}

type FunctionErrorBody = { error?: { code?: string; message?: string } };

const KNOWN_CODES: AiErrorCode[] = [
  "unauthorized",
  "forbidden",
  "bad_request",
  "not_configured",
  "rate_limited",
  "provider_auth",
  "provider_model",
  "provider_unavailable",
  "timeout",
  "internal",
];

/**
 * `functions.invoke` collapses every non-2xx response into a generic error, so
 * the useful part — the function's own code and sentence — has to be read back
 * off the response. Without this the UI would say "failed" for a quota limit, a
 * permission refusal and a provider outage alike.
 */
async function describeFailure(error: unknown): Promise<AiError> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as FunctionErrorBody;
      const message = body.error?.message;
      const code = body.error?.code;
      if (typeof message === "string" && message.trim()) {
        return new AiError(
          message,
          KNOWN_CODES.includes(code as AiErrorCode) ? (code as AiErrorCode) : "internal",
        );
      }
    } catch {
      /* Not JSON — fall through to the generic sentence below. */
    }
  }

  if (error instanceof Error && /fetch|network|load failed/i.test(error.message)) {
    return new AiError("SAVO AI could not be reached. Check your connection.", "network");
  }

  return new AiError("SAVO AI could not answer that. Try again.", "internal");
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("savo-ai", { body });
  if (error) throw await describeFailure(error);
  return data as T;
}

/** One question, with the turns that came before it. Server caps length and count. */
export async function askSavoAi(input: {
  shopId: string | null;
  messages: AiChatTurn[];
}): Promise<AiReply> {
  return invoke<AiReply>({
    action: "chat",
    ...(input.shopId ? { shopId: input.shopId } : {}),
    messages: input.messages,
  });
}

export type AiStudioBrief = {
  goal: string;
  audience: string;
  platform: string;
  format: string;
  duration: string;
  tone: string;
  language: string;
  feature: string;
  /** Only claims the person typed. The model is told to omit anything absent. */
  details: string;
  variation: string;
};

export type AiStudioScene = {
  scene?: number;
  duration?: string;
  visual?: string;
  narration?: string;
  onScreen?: string;
  transition?: string;
  sound?: string;
};

export type AiStudioDraft = {
  format?: string;
  title?: string;
  hook?: string;
  scenes?: AiStudioScene[];
  voiceover?: string;
  caption?: string;
  hashtags?: string[];
  cta?: string;
  notes?: string;
};

export async function generateStudioDraft(
  brief: AiStudioBrief,
): Promise<{ studio: AiStudioDraft; model: string | null }> {
  return invoke<{ studio: AiStudioDraft; model: string | null }>({
    action: "studio",
    studio: brief,
  });
}

export type AiStatus = {
  provider: "groq";
  configured: boolean;
  model: string | null;
  modelAvailable: boolean;
  reachable: boolean;
  latencyMs: number | null;
  providerError: string | null;
  availableModels: string[];
  limits: { requests: number; tokens: number };
  usageToday: { requests: number; tokens: number; accounts: number };
};

/** Platform-admin only. The function re-checks the claim; this is not a gate. */
export async function fetchAiStatus(): Promise<AiStatus> {
  return invoke<AiStatus>({ action: "status" });
}

export type KnowledgeEntry = {
  slug: string;
  title: string;
  body: string;
  updated_at?: string | null;
};

/** Admin read of the help text overrides that sit on top of the bundled copy. */
export async function listKnowledge(): Promise<KnowledgeEntry[]> {
  const { data, error } = await supabase.rpc("admin_list_knowledge");
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? (data as KnowledgeEntry[]) : [];
}

/** Writes one help topic. Rejected by the database unless the caller is an admin. */
export async function saveKnowledge(input: {
  slug: string;
  title: string;
  body: string;
}): Promise<void> {
  const { error } = await supabase.rpc("admin_set_knowledge", {
    p_slug: input.slug,
    p_title: input.title,
    p_body: input.body,
  });
  if (error) throw new Error(error.message);
}
