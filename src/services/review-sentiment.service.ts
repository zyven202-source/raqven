/**
 * Review sentiment.
 *
 * The classification itself runs in the `savo-ai` edge function, which is the
 * only place that holds the provider key. The browser only asks for labels for
 * its own shop's published feedback, and gets nothing back when SAVO AI is not
 * configured — the price of a real label is an honest "not available", never an
 * invented one.
 */
import { supabase } from "@/integrations/supabase/client";

export type SentimentLabel = "positive" | "neutral" | "negative";

export interface SentimentItem {
  id: string;
  label: SentimentLabel;
  score: number;
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
