import { useState } from "react";
import { Check, FileText, Loader2, Star, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { MarketReceiptSheet } from "@/components/marketlink/MarketReceiptSheet";
import { Button } from "@/components/ui/button";
import { useConfirmSettlement, useDisputeOrder, useSubmitReview } from "@/hooks/useMarketCommerce";
import { isSettled, type CustomerOrder } from "@/types/marketlink";
import { cn } from "@/lib/utils";

/**
 * The customer's side of the lifecycle: confirm completion, raise a problem,
 * leave feedback after a settled order, and open the Signature document.
 *
 * A confirmation here only records that this party considers the order done.
 * The order settles when the seller confirms too — the button never claims a
 * payment happened.
 */
export function OrderLifecycle({ order }: { order: CustomerOrder }) {
  const confirm = useConfirmSettlement();
  const dispute = useDisputeOrder();
  const review = useSubmitReview();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");

  const settled = isSettled(order.status);
  const confirmed = Boolean(order.customer_confirmed_at);
  const sellerConfirmed = Boolean(order.seller_confirmed_at);
  // A delivered or collected order can be confirmed by the buyer without
  // waiting for the seller to press "mark done". Either confirmation moves the
  // order into settlement; only the second one closes the sale.
  const canConfirm = [
    "accepted",
    "preparing",
    "ready_for_collection",
    "out_for_delivery",
    "awaiting_settlement",
    "disputed",
  ].includes(order.status);

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--brand-line)] pt-3">
      <div className="flex flex-wrap gap-2">
        {canConfirm && !confirmed ? (
          <Button
            className="h-10"
            disabled={confirm.isPending}
            onClick={() =>
              void confirm
                .mutateAsync(order.id)
                .then((state) =>
                  toast.success(
                    state.status === "settled"
                      ? "Order settled by both parties — the sale is complete"
                      : "Your confirmation is recorded. The sale completes when the seller confirms.",
                  ),
                )
                .catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : "Could not confirm."),
                )
            }
          >
            {confirm.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            Confirm completion
          </Button>
        ) : null}

        {confirmed ? (
          <p className="inline-flex h-10 items-center gap-1.5 rounded-md bg-positive-soft px-3 text-xs font-medium text-positive">
            <Check className="size-3.5" aria-hidden />
            You confirmed {formatConfirmed(order.customer_confirmed_at)}
          </p>
        ) : null}

        {confirmed && !settled ? (
          <p className="inline-flex h-10 items-center gap-1.5 rounded-md bg-[var(--brand-surface)] px-3 text-xs font-medium text-muted-foreground">
            {sellerConfirmed ? "The seller confirmed too" : "Waiting for the seller to confirm"}
          </p>
        ) : null}

        <Button variant="outline" className="h-10" onClick={() => setReceiptOpen(true)}>
          <FileText className="size-4" /> Document
        </Button>

        {!settled && order.status !== "cancelled" && order.status !== "rejected" ? (
          <Button
            variant="outline"
            className="h-10"
            onClick={() => setDisputing((value) => !value)}
            aria-expanded={disputing}
          >
            <TriangleAlert className="size-4" /> Raise a problem
          </Button>
        ) : null}
      </div>

      {disputing ? (
        <div className="rounded-lg border border-[var(--brand-line)] p-3">
          <label htmlFor={`dispute-${order.id}`} className="text-xs font-medium">
            What went wrong?
          </label>
          <textarea
            id={`dispute-${order.id}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={1000}
            className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="The shop and SAVO can both see this."
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-1 h-8"
            disabled={dispute.isPending || reason.trim().length < 5}
            onClick={() =>
              void dispute
                .mutateAsync({ orderId: order.id, reason })
                .then(() => {
                  toast.success("The shop has been told");
                  setDisputing(false);
                  setReason("");
                })
                .catch((error: unknown) =>
                  toast.error(
                    error instanceof Error ? error.message : "Could not raise the dispute.",
                  ),
                )
            }
          >
            {dispute.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Send to the shop
          </Button>
        </div>
      ) : null}

      {order.dispute_reason ? (
        <p className="rounded-md bg-caution-soft/50 p-2 text-[11px] leading-relaxed text-caution">
          Dispute on record: {order.dispute_reason}
        </p>
      ) : null}

      {settled && !order.review ? (
        <div className="rounded-lg border border-[var(--brand-line)] p-3">
          <p className="text-xs font-medium">Rate this order</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Only buyers with a settled order can review, and one order carries one review.
          </p>
          <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Star rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} star${value === 1 ? "" : "s"}`}
                onClick={() => setRating(value)}
                className="press p-0.5"
              >
                <Star
                  className={cn(
                    "size-6",
                    value <= rating
                      ? "fill-[var(--brand-primary)] text-[var(--brand-primary)]"
                      : "text-muted-foreground",
                  )}
                  aria-hidden
                />
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={2}
            maxLength={2000}
            aria-label="Your feedback"
            className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Optional — what should other buyers know?"
          />
          <Button
            size="sm"
            className="mt-1 h-9"
            disabled={rating === 0 || review.isPending}
            onClick={() =>
              void review
                .mutateAsync({ orderId: order.id, rating, body: comment.trim() || null })
                .then(() => toast.success("Thank you — your feedback is published"))
                .catch((error: unknown) =>
                  toast.error(
                    error instanceof Error ? error.message : "Could not save your feedback.",
                  ),
                )
            }
          >
            {review.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Publish feedback
          </Button>
        </div>
      ) : null}

      {order.review ? (
        <p className="flex items-center gap-1.5 rounded-md bg-[var(--brand-surface)] p-2 text-[11px] text-muted-foreground">
          <Star
            className="size-3.5 fill-[var(--brand-primary)] text-[var(--brand-primary)]"
            aria-hidden
          />
          You rated this order {order.review.rating}/5
          {order.review.body ? ` — “${order.review.body}”` : ""}
        </p>
      ) : null}

      <MarketReceiptSheet orderId={order.id} open={receiptOpen} onOpenChange={setReceiptOpen} />
    </div>
  );
}

function formatConfirmed(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
