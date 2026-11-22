import { useQuery } from "@tanstack/react-query";

import { classifyShopReviews } from "@/services/review-sentiment.service";

export const sentimentKey = (shopId: string) => ["market", "sentiment", shopId] as const;

/**
 * Labels for this shop's most recent reviews. Enabled only when the seller is
 * actually looking at their feedback, so a shop that never opens the section
 * never spends a provider request.
 */
export function useReviewSentiment(shopId: string, enabled: boolean) {
  return useQuery({
    queryKey: sentimentKey(shopId),
    queryFn: () => classifyShopReviews(shopId),
    enabled: Boolean(shopId) && enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
}
