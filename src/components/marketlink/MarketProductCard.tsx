import { Link } from "@tanstack/react-router";
import { Heart, ImageOff } from "lucide-react";

import { DELIVERY_SHORT, distanceLabel, stockLabel } from "@/lib/marketlink";
import { marketImageUrl } from "@/services/marketlink.service";
import type { MarketFeedItem } from "@/types/marketlink";
import { cn } from "@/lib/utils";

/**
 * A marketplace product.
 *
 * The photograph is the seller's own upload. When a listing somehow has no
 * readable image the card says so with a neutral placeholder — it never swaps in
 * a stock photo, because a customer deciding what to buy must see the real thing.
 *
 * The card is a div with the product link filling it, and the save control as a
 * sibling on top. That keeps the markup valid — a button may not live inside an
 * anchor — while still leaving the whole card tappable.
 */
export function MarketProductCard({
  item,
  className,
  favourite,
  onToggleFavourite,
}: {
  item: MarketFeedItem;
  className?: string;
  /** Undefined when nobody is signed in: a save button that cannot save is noise. */
  onToggleFavourite?: (() => void) | undefined;
  favourite?: boolean;
}) {
  const image = marketImageUrl(item.image_path);
  const distance = distanceLabel(item.distance_km);
  const deliveryKind = item.delivery_kinds[0];
  const delivery = deliveryKind ? `${DELIVERY_SHORT[deliveryKind]} delivery` : "Collection";
  const meta = [distance, delivery].filter(Boolean).join(" · ");

  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)]",
        className,
      )}
    >
      <Link
        to="/shop/$slug/p/$listingId"
        params={{ slug: item.shop_slug, listingId: item.id }}
        className="press flex flex-1 flex-col rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/60"
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
          <p className="truncate text-[11px] text-muted-foreground">{meta}</p>
        </div>
      </Link>

      {onToggleFavourite ? (
        <button
          type="button"
          onClick={onToggleFavourite}
          aria-pressed={favourite === true}
          aria-label={favourite ? `Remove ${item.name} from saved products` : `Save ${item.name}`}
          className="press absolute right-2 top-2 z-10 grid size-9 place-items-center rounded-full border border-[var(--brand-line)] bg-[var(--brand-surface)]/90 text-foreground/70 backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/60 active:scale-95"
        >
          <Heart
            className={cn("size-4", favourite ? "fill-current text-[var(--brand-primary)]" : "")}
            aria-hidden
          />
        </button>
      ) : null}
    </div>
  );
}
