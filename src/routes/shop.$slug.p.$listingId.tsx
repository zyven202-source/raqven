import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Minus, Plus, ShieldCheck, ShoppingBag, Truck } from "lucide-react";

import { CheckoutDrawer } from "@/components/marketlink/CheckoutDrawer";
import { MarketProductCard } from "@/components/marketlink/MarketProductCard";
import { MarketShell } from "@/components/marketlink/MarketShell";
import { Button } from "@/components/ui/button";
import { usePublicProduct } from "@/hooks/useMarketlink";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useShopCart } from "@/hooks/useShopCart";
import { feeLabel, stockLabel } from "@/lib/marketlink";
import { formatMoney } from "@/lib/format";
import { SITE_URL } from "@/lib/seo";
import { marketImageUrl } from "@/services/marketlink.service";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shop/$slug/p/$listingId")({
  head: () => ({
    meta: [
      { title: "Product — SAVO Marketlink" },
      {
        name: "description",
        content:
          "See the seller's own photo, the current public price and real availability, then send the shop an order request.",
      },
      { name: "robots", content: "index, follow, max-image-preview:large" },
    ],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { slug, listingId } = Route.useParams();
  const productQuery = usePublicProduct(slug, listingId);
  const payload = productQuery.data ?? null;
  const listing = payload?.listing ?? null;
  const shop = payload?.shop ?? null;
  const delivery = useMemo(() => payload?.delivery ?? [], [payload]);
  const cart = useShopCart(slug);
  const [quantity, setQuantity] = useState(1);
  const [cartOpen, setCartOpen] = useState(false);

  const image = listing ? marketImageUrl(listing.image_path) : null;
  const path = `/shop/${slug}/p/${listingId}`;
  const max = listing ? Math.max(1, Math.min(listing.max_quantity, 99)) : 1;
  const available = listing ? listing.stock_state !== "out" && listing.max_quantity > 0 : false;

  const jsonLd = useMemo(() => {
    if (!listing || !shop) return null;
    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name: listing.name,
      url: `${SITE_URL}${path}`,
      ...(listing.description ? { description: listing.description } : {}),
      ...(image ? { image: [image] } : {}),
      brand: { "@type": "Brand", name: shop.name },
      offers: {
        "@type": "Offer",
        price: Number(listing.price).toFixed(2),
        priceCurrency: listing.currency,
        availability:
          listing.stock_state === "out"
            ? "https://schema.org/OutOfStock"
            : "https://schema.org/InStock",
        url: `${SITE_URL}${path}`,
        seller: { "@type": "Organization", name: shop.name },
      },
    };
  }, [listing, shop, image, path]);

  usePageSeo({
    title: listing && shop ? `${listing.name} — ${shop.name}` : "Product — SAVO Marketlink",
    description:
      listing && shop
        ? listing.description ||
          `Buy ${listing.name} from ${shop.name} on SAVO Marketlink. ${formatMoney(listing.price, listing.currency)}.`
        : "This product is not available on SAVO Marketlink.",
    path,
    ...(image ? { image } : {}),
    type: "product",
    jsonLd,
    noindex: !listing,
  });

  if (productQuery.isLoading) {
    return (
      <MarketShell back={{ to: "/market", label: "Marketplace" }}>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
        </div>
      </MarketShell>
    );
  }

  if (!listing || !shop) {
    return (
      <MarketShell back={{ to: "/market", label: "Marketplace" }}>
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-5 py-20 text-center">
          <ShoppingBag className="size-8 text-muted-foreground" aria-hidden />
          <h1 className="font-display text-2xl font-semibold">This product is not available</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            It may have been unpublished, sold, or removed by the seller. Nothing private about the
            shop is shown while it is offline.
          </p>
          <Button asChild className="mt-2">
            <Link to="/market">Browse the marketplace</Link>
          </Button>
        </div>
      </MarketShell>
    );
  }

  return (
    <MarketShell back={{ to: `/shop/${slug}`, label: shop.name }}>
      <div className="mx-auto w-full max-w-6xl px-4 py-5 pb-28 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <div className="overflow-hidden rounded-2xl border border-[var(--brand-line)] bg-[var(--brand-raised)]">
            {image ? (
              <img
                src={image}
                alt={`${listing.name} — product photo from ${shop.name}`}
                className="aspect-square w-full object-cover"
                width={800}
                height={800}
              />
            ) : (
              <div className="grid aspect-square place-items-center text-muted-foreground">
                <ShoppingBag className="size-8" aria-hidden />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <Link
              to="/shop/$slug"
              params={{ slug }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              {shop.name}
            </Link>
            <h1 className="mt-2 font-display text-2xl font-semibold leading-tight sm:text-3xl">
              {listing.name}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="tnum font-display text-2xl font-semibold text-[var(--brand-primary)]">
                {formatMoney(listing.price, listing.currency)}
              </p>
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  listing.stock_state === "out"
                    ? "bg-negative-soft text-negative"
                    : listing.stock_state === "low"
                      ? "bg-caution-soft text-caution"
                      : "bg-positive-soft text-positive",
                )}
              >
                {stockLabel(listing.stock_state)}
              </span>
              {listing.category ? (
                <span className="rounded-full border border-[var(--brand-line)] px-2.5 py-1 text-[11px] text-muted-foreground">
                  {listing.category}
                </span>
              ) : null}
            </div>

            {listing.description ? (
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/85">
                {listing.description}
              </p>
            ) : null}

            <div className="mt-5 rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] p-4">
              <p className="text-sm font-semibold">{shop.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[shop.city, shop.region, shop.country].filter(Boolean).join(", ") ||
                  "Location not published"}
              </p>
              <Link
                to="/shop/$slug"
                params={{ slug }}
                className="mt-2 inline-block text-xs font-medium text-[var(--brand-primary)] underline-offset-4 hover:underline"
              >
                Visit the shop
              </Link>
            </div>

            {available ? (
              <div className="mt-5">
                <div className="flex items-center gap-3">
                  <div className="flex items-center rounded-lg border border-[var(--brand-line)]">
                    <button
                      type="button"
                      aria-label="One fewer"
                      disabled={quantity <= 1}
                      onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                      className="press grid size-11 place-items-center disabled:opacity-40"
                    >
                      <Minus className="size-4" aria-hidden />
                    </button>
                    <span className="tnum min-w-8 text-center text-sm font-semibold">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      aria-label="One more"
                      disabled={quantity >= max}
                      onClick={() => setQuantity((value) => Math.min(max, value + 1))}
                      className="press grid size-11 place-items-center disabled:opacity-40"
                    >
                      <Plus className="size-4" aria-hidden />
                    </button>
                  </div>
                  <Button
                    className="h-11 flex-1"
                    onClick={() => {
                      cart.add(listing, quantity);
                      setCartOpen(true);
                    }}
                  >
                    <ShoppingBag className="size-4" /> Add to basket
                  </Button>
                </div>
                {listing.max_quantity <= 5 ? (
                  <p className="mt-2 text-xs text-caution">
                    Only {listing.max_quantity} available to request at the moment.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-5 rounded-lg border border-negative/30 bg-negative-soft/50 px-3 py-2.5 text-sm text-negative">
                This product is out of stock. The seller updates availability from their inventory.
              </p>
            )}

            <div className="mt-5 rounded-xl border border-[var(--brand-line)] p-4">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Truck className="size-4 text-[var(--brand-primary)]" aria-hidden />
                Delivery and collection
              </p>
              {delivery.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {delivery.map((zone) => (
                    <li key={zone.id}>
                      {zone.kind === "local"
                        ? `Local — ${[zone.city, zone.region, zone.country].filter(Boolean).join(", ")}`
                        : zone.kind === "nationwide"
                          ? `Nationwide — ${zone.country}`
                          : "Worldwide"}{" "}
                      · {feeLabel(zone.fee, shop.currency)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Collection from the shop. Ask about delivery in your note.
                </p>
              )}
              <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden />A
                request is sent to the seller. No payment is taken here and stock is not reserved
                until the shop confirms.
              </p>
            </div>
          </div>
        </div>

        {(payload?.related ?? []).length > 0 ? (
          <section className="mt-10">
            <h2 className="font-display text-xl font-semibold">More from {shop.name}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(payload?.related ?? []).map((item) => (
                <MarketProductCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      {cart.count > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--brand-line)] bg-[var(--brand-surface)] px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="tnum text-sm font-semibold">
                {cart.count} item{cart.count === 1 ? "" : "s"} ·{" "}
                {formatMoney(cart.subtotal, shop.currency)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                Order request · nothing is paid here
              </p>
            </div>
            <Button className="h-11" onClick={() => setCartOpen(true)}>
              View basket
            </Button>
          </div>
        </div>
      ) : null}

      <CheckoutDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        shop={shop}
        delivery={delivery}
        lines={cart.lines}
        onQuantityChange={cart.setQuantity}
        onRemove={cart.remove}
        onClear={cart.clear}
        originPath={path}
      />
    </MarketShell>
  );
}
