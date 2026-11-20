import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, LockKeyhole, ShoppingBag, Users } from "lucide-react";

import { MarketShell } from "@/components/marketlink/MarketShell";
import { Button } from "@/components/ui/button";
import { useListPayload } from "@/hooks/useMarketCommerce";
import { formatMoney } from "@/lib/format";
import { marketImageUrl } from "@/services/marketlink.service";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/list/$token")({
  head: () => ({
    meta: [
      { title: "Shared shopping list — SAVO Circles" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SharedList,
});

/**
 * The public face of a shared list.
 *
 * It receives only what `marketlink_list_payload` returns for a token: the list
 * name, its items and real matching listings. The owner's identity, account,
 * addresses and other lists are never part of that payload.
 */
function SharedList() {
  const { token } = Route.useParams();
  const payload = useListPayload(null, token);

  if (payload.isLoading) {
    return (
      <MarketShell back={{ to: "/market", label: "Marketplace" }}>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
        </div>
      </MarketShell>
    );
  }

  if (payload.isError || !payload.data) {
    return (
      <MarketShell back={{ to: "/market", label: "Marketplace" }}>
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-5 py-20 text-center">
          <LockKeyhole className="size-8 text-muted-foreground" aria-hidden />
          <h1 className="font-display text-2xl font-semibold">This list is not available</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            The link may have been reset, or sharing may have been turned off. Ask the person who
            shared it for a new link.
          </p>
          <Button asChild className="mt-2">
            <Link to="/market">Browse the marketplace</Link>
          </Button>
        </div>
      </MarketShell>
    );
  }

  const list = payload.data;
  const sellers = new Set(
    list.items.flatMap((item) => item.candidates.filter((c) => c.in_stock).map((c) => c.shop_slug)),
  );

  return (
    <MarketShell back={{ to: "/market", label: "Marketplace" }}>
      <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--brand-primary)]">
          <Users className="size-3.5" aria-hidden /> Shared list
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight">{list.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {list.items.length} item{list.items.length === 1 ? "" : "s"} ·{" "}
          {sellers.size === 0
            ? "no matching sellers right now"
            : `${sellers.size} seller${sellers.size === 1 ? "" : "s"} can supply part of this list`}
        </p>

        {list.items.length === 0 ? (
          <div className="mt-6 rounded-xl border border-[var(--brand-line)] p-6 text-center">
            <ShoppingBag className="mx-auto size-6 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm text-muted-foreground">This list has no items yet.</p>
          </div>
        ) : (
          <ul className="mt-5 space-y-3">
            {list.items.map((item) => {
              const available = item.candidates.filter((candidate) => candidate.in_stock);
              const exact = item.candidates.find(
                (candidate) => candidate.is_requested && candidate.in_stock,
              );
              return (
                <li key={item.id} className="rounded-xl border border-[var(--brand-line)] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {Number(item.quantity)} × {item.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {item.resolved
                          ? "Already gathered"
                          : exact
                            ? "Available from the shop it was saved from"
                            : available.length > 0
                              ? "Matching products available"
                              : "No published product matches this yet"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        item.resolved
                          ? "bg-sunken text-muted-foreground"
                          : available.length > 0
                            ? "bg-positive-soft text-positive"
                            : "bg-caution-soft text-caution",
                      )}
                    >
                      {item.resolved
                        ? "Gathered"
                        : available.length > 0
                          ? "Available"
                          : "Unavailable"}
                    </span>
                  </div>

                  {available.length > 0 ? (
                    <ul className="mt-3 space-y-1.5">
                      {available.map((candidate) => (
                        <li key={candidate.listing_id} className="flex items-center gap-2">
                          <div className="size-9 shrink-0 overflow-hidden rounded bg-[var(--brand-surface)]">
                            {marketImageUrl(candidate.image_path) ? (
                              <img
                                src={marketImageUrl(candidate.image_path) ?? ""}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{candidate.name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {candidate.shop_name} ·{" "}
                              {formatMoney(candidate.price, candidate.currency)}
                              {candidate.max_quantity < Number(item.quantity)
                                ? ` · only ${candidate.max_quantity} left`
                                : ""}
                            </p>
                          </div>
                          <Button asChild size="sm" variant="outline" className="h-8 shrink-0">
                            <Link
                              to="/shop/$slug/p/$listingId"
                              params={{
                                slug: candidate.shop_slug,
                                listingId: candidate.listing_id,
                              }}
                            >
                              Open
                            </Link>
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-5 text-[11px] leading-relaxed text-muted-foreground">
          Prices and availability come from each seller&rsquo;s live inventory. This page never
          declares a product the cheapest: it only lists what is published right now. Each seller
          takes their own order.
        </p>
      </section>
    </MarketShell>
  );
}
