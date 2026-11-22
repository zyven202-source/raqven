import { useQuery, useQueryClient } from "@tanstack/react-query";

import { classifyShopReviews, fetchStoredSentiment } from "@/services/review-sentiment.service";

export const sentimentKey = (shopId: string) => ["market", "sentiment", shopId] as const;
export const storedSentimentKey = (shopId: string) =>
  ["market", "sentiment-stored", shopId] as const;

/**
 * The labels already stored on this shop's reviews. This is the read the
 * feedback section normally makes: one small query, no provider request.
 */
export function useStoredSentiment(shopId: string, enabled: boolean) {
  return useQuery({
    queryKey: storedSentimentKey(shopId),
    queryFn: () => fetchStoredSentiment(shopId),
    enabled: Boolean(shopId) && enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * Fills in reviews that have no stored label yet.
 *
 * The caller enables this only when some visible review is unlabelled, so opening
 * the section a second time does not touch the function at all. A successful run
 * has written the labels to the rows, so the stored list is refreshed straight
 * away and the cheap read becomes the answer again.
 */
export function useReviewSentiment(shopId: string, enabled: boolean) {
  const client = useQueryClient();
  return useQuery({
    queryKey: sentimentKey(shopId),
    queryFn: async () => {
      const result = await classifyShopReviews(shopId);
      if (result.items.length > 0) {
        void client.invalidateQueries({ queryKey: storedSentimentKey(shopId) });
      }
      return result;
    },
    enabled: Boolean(shopId) && enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
}
