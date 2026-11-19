import { createFileRoute, Link } from "@tanstack/react-router";
import { Package, Store } from "lucide-react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { MarketShell } from "@/components/marketlink/MarketShell";
import { Button } from "@/components/ui/button";
import { useMyOrders } from "@/hooks/useMarketlink";
import { useSession } from "@/hooks/useSession";
import { formatDateTime, formatMoney } from "@/lib/format";
import { MARKETLINK_STATUS_LABEL } from "@/types/marketlink";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/account/orders")({
  head: () => ({
    meta: [{ title: "SAVO — My order requests" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AccountOrders,
});

/**
 * A customer's own requests, across every shop they bought from.
 *
 * This is the one customer surface inside SAVO. It is deliberately outside the
 * `/app` workspace: a customer has no shop dashboard, no inventory and no
 * employee tools, and the database gives their account none of those either.
 */
function AccountOrders() {
  const { session } = useSession();
  const orders = useMyOrders(Boolean(session));

  return (
    <MarketShell back={{ to: "/market", label: "Marketplace" }}>
      <PageContainer className="pb-10 pt-6">
        <PageHeader
          eyebrow="Marketlink"
          title="My order requests"
          subtitle="Requests you have sent to shops, and where each one stands."
        />

        {orders.isLoading ? (
          <LoadingState label="Loading your requests…" />
        ) : orders.isError ? (
          <ErrorState message={orders.error.message} onRetry={() => void orders.refetch()} />
        ) : (orders.data ?? []).length === 0 ? (
          <EmptyState
            title="No requests yet"
            description="When you send an order request to a shop it appears here with the seller's answer."
            action={
              <Button asChild>
                <Link to="/market">Browse the marketplace</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-3">
            {(orders.data ?? []).map((order) => (
              <li
                key={order.id}
                className="rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="tnum text-sm font-semibold">{order.reference}</p>
                    <Link
                      to="/shop/$slug"
                      params={{ slug: order.shop_slug }}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Store className="size-3.5" aria-hidden />
                      {order.shop_name}
                    </Link>
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

                <ul className="mt-3 space-y-1 border-t border-[var(--brand-line)] pt-2 text-xs text-muted-foreground">
                  {order.items.map((item, index) => (
                    <li key={`${order.id}-${index}`} className="flex justify-between gap-3">
                      <span className="truncate">
                        {Number(item.quantity)} × {item.name}
                      </span>
                      <span className="tnum shrink-0">
                        {formatMoney(item.line_total, order.currency)}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="text-[11px] text-muted-foreground">
                    {formatDateTime(order.created_at)} ·{" "}
                    {order.fulfillment === "delivery" ? "Delivery" : "Collection"}
                  </p>
                  <div className="text-right">
                    <p className="tnum text-sm font-semibold">
                      {formatMoney(order.subtotal, order.currency)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {order.delivery_fee === null
                        ? "Delivery to confirm"
                        : `+ ${formatMoney(order.delivery_fee, order.currency)} delivery`}
                    </p>
                  </div>
                </div>

                {order.status === "pending" ? (
                  <p className="mt-2 flex items-start gap-1.5 rounded-md bg-[var(--brand-surface)] p-2 text-[11px] leading-relaxed text-muted-foreground">
                    <Package className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    The shop has not confirmed this yet. Nothing has been paid.
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </PageContainer>
    </MarketShell>
  );
}
