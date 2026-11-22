/**
 * Review sentiment.
 *
 * A review's sentiment is decided once by the `savo-ai` edge function — the only
 * place that holds the provider key — and stored on the review row. The seller's
 * feedback section reads those stored labels; it only asks the function to fill
 * in reviews that have no label yet, which is exactly the set of reviews that
 * arrived since the last time it ran.
 *
 * Nothing here is invented locally: when SAVO AI is not configured the stored
 * labels are still returned and the missing ones stay missing.
 */
import { supabase } from "@/integrations/supabase/client";

export type SentimentLabel = "positive" | "neutral" | "negative";

export interface SentimentItem {
  id: string;
  label: SentimentLabel;
  score: number;
}

export interface StoredSentimentItem extends SentimentItem {
  model: string | null;
  computed_at: string | null;
}

export interface SentimentResult {
  configured: boolean;
  model: string | null;
  items: SentimentItem[];
  reason?: string;
}

interface FunctionErrorBody {
  error?: { message?: string };
}

/** Narrow cast for an RPC that the generated client types do not know yet. */
type RpcResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => RpcResult;

async function describeFailure(error: unknown): Promise<Error> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as FunctionErrorBody;
      const message = body.error?.message;
      if (typeof message === "string" && message.trim()) return new Error(message);
    } catch {
      /* Not JSON — fall through. */
    }
  }
  if (error instanceof Error && /fetch|network|load failed/i.test(error.message)) {
    return new Error("Sentiment needs a connection. Try again.");
  }
  return new Error("Sentiment could not be read right now.");
}

/** Labels already stored on this shop's reviews. No model call, no quota spent. */
export async function fetchStoredSentiment(shopId: string): Promise<StoredSentimentItem[]> {
  const { data, error } = await rpc("marketlink_shop_sentiment", { p_shop_id: shopId });
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) return [];
  return (data as StoredSentimentItem[]).filter(
    (item) => item && typeof item.id === "string" && typeof item.label === "string",
  );
}

/**
 * Labels any review that does not have one yet, then returns every label the
 * shop has. Safe to call when nothing is missing: the function answers from the
 * stored rows without contacting the provider.
 */
export async function classifyShopReviews(shopId: string): Promise<SentimentResult> {
  const { data, error } = await supabase.functions.invoke("savo-ai", {
    body: { action: "sentiment", shopId },
  });
  if (error) throw await describeFailure(error);
  const result = data as SentimentResult | null;
  if (!result) return { configured: false, model: null, items: [] };
  return {
    configured: Boolean(result.configured),
    model: result.model ?? null,
    items: Array.isArray(result.items) ? result.items : [],
    ...(result.reason ? { reason: result.reason } : {}),
  };
}
