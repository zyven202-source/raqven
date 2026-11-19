import { useEffect, useState } from "react";
import { Check, CircleSlash, Loader2, Mail, Phone, Save, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import { useSaveOwnerNote, useSetOrderStatus } from "@/hooks/useMarketlink";
import { formatDateTime, formatMoney } from "@/lib/format";
import { feeLabel, zoneLabel } from "@/lib/marketlink";
import { marketImageUrl, type SellerOrder } from "@/services/marketlink.service";
import { MARKETLINK_STATUS_LABEL } from "@/types/marketlink";
import type { MarketlinkOrderStatus } from "@/types/savo";
import { cn } from "@/lib/utils";

const NEXT_STATUS: Record<
  MarketlinkOrderStatus,
  { status: MarketlinkOrderStatus; label: string }[]
> = {
  pending: [
    { status: "accepted", label: "Accept request" },
    { status: "rejected", label: "Reject" },
    { status: "cancelled", label: "Cancel" },
  ],
  accepted: [
    { status: "completed", label: "Mark completed" },
    { status: "cancelled", label: "Cancel" },
  ],
  rejected: [],
  cancelled: [],
  completed: [],
};

/**
 * One order request, as the seller needs to see it.
 *
 * The contact buttons open the customer's own dialler, mail app or WhatsApp.
 * They are clearly user-initiated: SAVO does not send the message and does not
 * claim to have sent it.
 */
export function OrderDetailSheet({
  shopId,
  order,
  open,
  onOpenChange,
}: {
  shopId: string;
  order: SellerOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const update = useSetOrderStatus(shopId);
  const saveNote = useSaveOwnerNote(shopId);
  const [note, setNote] = useState("");

  useEffect(() => {
    setNote(order?.owner_note ?? "");
  }, [order?.id, order?.owner_note]);

  if (!order) return null;

  const digits = (order.customer_phone ?? "").replace(/[^0-9]/g, "");
  const waLink = digits ? `https://wa.me/${digits}` : null;
  const address = [
    order.delivery_address,
    order.destination_city,
    order.destination_region,
    order.destination_country,
  ]
    .filter(Boolean)
    .join(", ");

  async function change(status: MarketlinkOrderStatus) {
    try {
      await update.mutateAsync({ order: order!, status });
      toast.success(
        `Order ${order!.reference} marked ${MARKETLINK_STATUS_LABEL[status].toLowerCase()}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The status could not be changed.");
    }
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerContent className="glass-sheet mx-auto max-h-[94dvh] max-w-lg gap-0 rounded-t-glass-lg px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] text-foreground">
        <div className="mx-auto w-full max-w-md overflow-y-auto overscroll-contain">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DrawerTitle className="text-left font-display text-xl font-semibold">
                {order.reference}
              </DrawerTitle>
              <DrawerDescription className="mt-1 text-left text-sm text-muted-foreground">
                {formatDateTime(order.created_at)}
              </DrawerDescription>
            </div>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                order.status === "pending"
                  ? "bg-caution-soft text-caution"
                  : order.status === "accepted"
                    ? "bg-positive-soft text-positive"
                    : order.status === "completed"
                      ? "bg-info-soft text-info"
                      : "bg-sunken text-muted-foreground",
              )}
            >
              {MARKETLINK_STATUS_LABEL[order.status]}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <section className="rounded-lg border border-[var(--brand-line)] p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Customer</p>
              <p className="mt-1 font-semibold">{order.customer_name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Prefers {order.preferred_contact}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {order.customer_phone ? (
                  <>
                    <a
                      href={`tel:${order.customer_phone}`}
                      className="press inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--brand-line)] px-3 text-xs font-medium"
                    >
                      <Phone className="size-3.5" aria-hidden /> Call
                    </a>
                    {waLink ? (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="press inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--brand-line)] px-3 text-xs font-medium"
                      >
                        WhatsApp
                      </a>
                    ) : null}
                  </>
                ) : null}
                {order.customer_email ? (
                  <a
                    href={`mailto:${order.customer_email}?subject=${encodeURIComponent(`Your SAVO request ${order.reference}`)}`}
                    className="press inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--brand-line)] px-3 text-xs font-medium"
                  >
                    <Mail className="size-3.5" aria-hidden /> Email
                  </a>
                ) : null}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                These open your own phone or email app. SAVO does not send the message for you.
              </p>
            </section>

            <section className="rounded-lg border border-[var(--brand-line)] p-3 text-sm">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {order.fulfillment === "delivery" ? "Deliver to" : "Collection"}
              </p>
              <p className="mt-1">
                {order.fulfillment === "delivery"
                  ? address || "No address recorded"
                  : "Customer will collect from the shop"}
              </p>
              {order.delivery_fee !== null ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {feeLabel(order.delivery_fee, order.currency)}
                </p>
              ) : null}
              {order.delivery_note ? (
                <p className="mt-2 rounded-md bg-[var(--brand-surface)] p-2 text-xs text-muted-foreground">
                  “{order.delivery_note}”
                </p>
              ) : null}
            </section>

            <ul className="divide-y divide-[var(--brand-line)] border-y border-[var(--brand-line)]">
              {order.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <div className="size-10 shrink-0 overflow-hidden rounded bg-[var(--brand-surface)]">
                    {marketImageUrl(item.image_path) ? (
                      <img
                        src={marketImageUrl(item.image_path) ?? ""}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.product_name}</p>
                    <p className="tnum text-xs text-muted-foreground">
                      {Number(item.quantity)} × {formatMoney(item.unit_price, order.currency)}
                    </p>
                  </div>
                  <p className="tnum text-sm font-semibold">
                    {formatMoney(item.line_total, order.currency)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Items</span>
                <span className="tnum">{formatMoney(order.subtotal, order.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivery</span>
                <span className="tnum">
                  {order.delivery_fee === null
                    ? "To confirm"
                    : formatMoney(order.delivery_fee, order.currency)}
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="owner-note" className="text-xs font-medium text-muted-foreground">
                Private note about this request
              </label>
              <textarea
                id="owner-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                maxLength={1000}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-1 h-8"
                disabled={saveNote.isPending}
                onClick={() =>
                  void saveNote
                    .mutateAsync({ orderId: order.id, note })
                    .then(() => toast.success("Note saved"))
                    .catch((error: unknown) =>
                      toast.error(
                        error instanceof Error ? error.message : "Could not save the note.",
                      ),
                    )
                }
              >
                <Save className="size-3.5" /> Save note
              </Button>
            </div>

            {NEXT_STATUS[order.status].length > 0 ? (
              <div className="flex flex-col gap-2 pt-1">
                {NEXT_STATUS[order.status].map((action) => (
                  <Button
                    key={action.status}
                    type="button"
                    variant={
                      action.status === "accepted" || action.status === "completed"
                        ? "default"
                        : "outline"
                    }
                    className="h-11 w-full"
                    disabled={update.isPending}
                    onClick={() => void change(action.status)}
                  >
                    {update.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    {action.status === "accepted" || action.status === "completed" ? (
                      <Check className="size-4" aria-hidden />
                    ) : action.status === "rejected" ? (
                      <X className="size-4" aria-hidden />
                    ) : (
                      <CircleSlash className="size-4" aria-hidden />
                    )}
                    {action.label}
                  </Button>
                ))}
              </div>
            ) : null}

            <p className="pb-2 text-[11px] leading-relaxed text-muted-foreground">
              Accepting a request does not record a sale or take payment. Complete the sale at the
              till so stock and receipts stay correct.
            </p>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
