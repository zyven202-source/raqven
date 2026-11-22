import { MessageSquareText, Sparkles, Star } from "lucide-react";

import { useShopReputation, useShopReviews } from "@/hooks/useMarketCommerce";
import { useReviewSentiment } from "@/hooks/useReviewSentiment";
import { formatDateTime } from "@/lib/format";
import type { SentimentLabel } from "@/services/review-sentiment.service";
import { cn } from "@/lib/utils";

const SENTIMENT_STYLE: Record<SentimentLabel, { label: string; className: string }> = {
  positive: { label: "Positive", className: "bg-positive-soft text-positive" },
  neutral: { label: "Mixed", className: "bg-caution-soft text-caution" },
  negative: { label: "Negative", className: "bg-negative-soft text-negative" },
};

/**
 * What buyers said, and what the words actually meant.
 *
 * The rating and the written feedback come from the public review RPCs, with no
 * customer identity attached. The sentiment chip is a model label for the text
 * only — it is shown when the `savo-ai` function is configured, and the section
 * says plainly when it is not. A rating is never replaced by a label.
 */
export function SellerFeedback({ shopId, slug }: { shopId: string; slug: string }) {
  const reviews = useShopReviews(slug);
  const reputation = useShopReputation(slug);
  const sentiment = useReviewSentiment(shopId, Boolean(shopId) && (reviews.data?.length ?? 0) > 0);

  const list = (reviews.data ?? []).slice(0, 8);
  const average = reputation.data?.average ?? 0;
  const count = reputation.data?.count ?? 0;

  return (
    <section className="card-surface mt-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <span className="text-[var(--brand-primary)]">
              <MessageSquareText className="size-4" aria-hidden />
            </span>
            Buyer feedback
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Only buyers with a settled order can review, and one order carries one review.
          </p>
        </div>
        <div className="text-right">
          <p className="tnum font-display text-2xl font-semibold">
            {count > 0 ? average.toFixed(1) : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {count === 0 ? "No reviews yet" : `${count} review${count === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      {reviews.isLoading ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading feedback…</p>
      ) : list.length === 0 ? (
        <p className="mt-3 rounded-lg bg-[var(--brand-surface)] px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          When an order settles, the buyer can rate it here. Reviews are published with “Verified
          customer” rather than a name.
        </p>
      ) : (
        <>
          <ul className="mt-3 divide-y divide-[var(--brand-line)] border-y border-[var(--brand-line)]">
            {list.map((review) => {
              const chip = sentiment.data?.items.find((item) => item.id === review.id);
              return (
                <li key={review.id} className="py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="flex items-center gap-0.5"
                      aria-label={`${review.rating} out of 5`}
                    >
                      {[1, 2, 3, 4, 5].map((value) => (
                        <Star
                          key={value}
                          aria-hidden
                          className={cn(
                            "size-3.5",
                            value <= review.rating
                              ? "fill-[var(--brand-primary)] text-[var(--brand-primary)]"
                              : "text-muted-foreground/40",
                          )}
                        />
                      ))}
                    </span>
                    {chip ? (
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          SENTIMENT_STYLE[chip.label].className,
                        )}
                        title={`Model label for the words, not the stars (confidence ${Math.round(chip.score * 100)}%)`}
                      >
                        {SENTIMENT_STYLE[chip.label].label}
                      </span>
                    ) : null}
                    <span className="text-[11px] text-muted-foreground">
                      {review.author} · {formatDateTime(review.created_at)}
                    </span>
                  </div>
                  {review.body ? (
                    <p className="mt-1.5 text-sm leading-relaxed">{review.body}</p>
                  ) : (
                    <p className="mt-1.5 text-xs italic text-muted-foreground">
                      Rating only, no written comment.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {sentiment.isError ? (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Sentiment labels are unavailable right now — the ratings and comments above are
              unaffected.
            </p>
          ) : sentiment.data && !sentiment.data.configured ? (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Sentiment labels appear when SAVO AI is configured on this deployment. The ratings and
              comments above do not depend on it.
            </p>
          ) : sentiment.data?.configured && sentiment.data.items.length > 0 ? (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Sparkles className="size-3.5" aria-hidden /> Labels describe the written feedback
              only.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
