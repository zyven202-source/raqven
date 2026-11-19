import { Link } from "@tanstack/react-router";
import { ImageOff } from "lucide-react";

import { distanceLabel, stockLabel } from "@/lib/marketlink";
import { marketImageUrl } from "@/services/marketlink.service";
import type { MarketFeedItem } from "@/types/marketlink";
import { cn } from "@/lib/utils";

/**
 * A marketplace product.
 *
 * The photograph is the seller's own upload. When a listing somehow has no
 * readable image the card says so with a neutral placeholder — it never swaps in
 * a stock photo, because a customer deciding what to buy must see the real thing.
 */
export function MarketProductCard({
  item,
  className,
}: {
  item: MarketFeedItem;
  className?: string;
}) {
  const image = marketImageUrl(item.image_path);
  const distance = distanceLabel(item.distance_km);

  return (
    <Link
      to="/shop/$slug/p/$listingId"
      params={{ slug: item.shop_slug, listingId: item.id }}
      className={cn(
        "press group flex flex-col overflow-hidden rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] text-left",
        className,
      )}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-[var(--brand-surface)]">
        {image ? (
          <img
            src={image}
            alt={`${item.name} — product photo`}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <span className="grid size-full place-items-center text-muted-foreground">
            <ImageOff className="size-7" aria-hidden />
          </span>
        )}
        {item.stock_state === "out" ? (
          <span className="absolute inset-x-0 bottom-0 bg-black/70 px-2 py-1 text-center text-[11px] font-semibold text-white">
            Out of stock
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {item.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">{item.shop_name}</p>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className="tnum text-sm font-bold text-[var(--brand-primary)]">
            {item.currency} {Number(item.price).toFixed(2)}
          </span>
          <span
            className={cn(
              "text-[11px] font-medium",
              item.stock_state === "out"
                ? "text-negative"
                : item.stock_state === "low"
                  ? "text-caution"
                  : "text-positive",
            )}
          >
            {stockLabel(item.stock_state)}
          </span>
        </div>
        {distance ? <p className="text-[11px] text-muted-foreground">{distance}</p> : null}
      </div>
    </Link>
  );
}
