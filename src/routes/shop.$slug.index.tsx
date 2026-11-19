import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Search,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";

import { CheckoutDrawer } from "@/components/marketlink/CheckoutDrawer";
import { MarketProductCard } from "@/components/marketlink/MarketProductCard";
import { MarketShell } from "@/components/marketlink/MarketShell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  useFavouriteIds,
  useMarketFeed,
  usePublicShop,
  useToggleFavourite,
} from "@/hooks/useMarketlink";
import { useSession } from "@/hooks/useSession";
import { usePageSeo } from "@/hooks/usePageSeo";
import { useShopCart } from "@/hooks/useShopCart";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { DELIVERY_SHORT, feeLabel } from "@/lib/marketlink";
import { formatMoney } from "@/lib/format";
import { SITE_URL } from "@/lib/seo";
import { marketImageUrl } from "@/services/marketlink.service";

export const Route = createFileRoute("/shop/$slug/")({
  head: () =>
    // The static head is generic on purpose; `usePageSeo` replaces it with the
    // real shop's facts as soon as the public payload lands, and the build-time
    // pass writes those same facts into this path's served HTML.
    ({
      meta: [
        { title: "Shop — SAVO Marketlink" },
        {
          name: "description",
          content:
            "Browse a real SAVO shop: current prices, stock availability and a direct order request to the seller.",
        },
        { name: "robots", content: "index, follow, max-image-preview:large" },
      ],
    }),
  component: ShopPage,
});

function ShopPage() {
  const { slug } = Route.useParams();
  const shopQuery = usePublicShop(slug);
  const shop = shopQuery.data?.shop ?? null;
  const delivery = useMemo(() => shopQuery.data?.delivery ?? [], [shopQuery.data]);

  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);
  const [cartOpen, setCartOpen] = useState(false);
  const cart = useShopCart(slug);
  const { user } = useSession();
  const favouriteIds = useFavouriteIds(Boolean(user));
  const favourites = useMemo(() => new Set(favouriteIds.data ?? []), [favouriteIds.data]);
  const toggleFavourite = useToggleFavourite();

  const filters = useMemo(
    () => ({
      shopSlug: slug,
      ...(debounced.trim() ? { search: debounced.trim() } : {}),
      limit: 24,
    }),
    [slug, debounced],
  );
  const feed = useMarketFeed(filters);
  const items = feed.data?.pages.flatMap((page) => page.items) ?? [];

  const shopUrl = `${SITE_URL}/shop/${slug}`;
  const jsonLd = useMemo(() => {
    if (!shop) return null;
    return {
      "@context": "https://schema.org",
      "@type": "Store",
      name: shop.name,
      url: shopUrl,
      ...(shop.description ? { description: shop.description } : {}),
      ...(shop.phone ? { telephone: shop.phone } : {}),
      ...(shop.email ? { email: shop.email } : {}),
      ...(shop.country || shop.region || shop.city
        ? {
            address: {
              "@type": "PostalAddress",
              ...(shop.city ? { addressLocality: shop.city } : {}),
              ...(shop.region ? { addressRegion: shop.region } : {}),
              ...(shop.country ? { addressCountry: shop.country } : {}),
            },
          }
        : {}),
    };
  }, [shop, shopUrl]);

  usePageSeo({
    title: shop ? `${shop.name} — SAVO Marketlink` : "Shop — SAVO Marketlink",
    description: shop
      ? shop.description ||
        `Browse ${shop.name} on SAVO Marketlink and send the shop an order request.`
      : "This shop is not available on SAVO Marketlink.",
    path: `/shop/${slug}`,
    ...(shopQuery.data?.products?.[0]?.image_path
      ? { image: marketImageUrl(shopQuery.data.products[0].image_path) }
      : {}),
    type: "profile",
    jsonLd,
    noindex: !shop,
  });

  if (shopQuery.isLoading) {
    return (
      <MarketShell back={{ to: "/market", label: "Marketplace" }}>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
        </div>
      </MarketShell>
    );
  }

  if (!shop) {
    return (
      <MarketShell back={{ to: "/market", label: "Marketplace" }}>
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-5 py-20 text-center">
          <Store className="size-8 text-muted-foreground" aria-hidden />
          <h1 className="font-display text-2xl font-semibold">This shop is not available</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            It may be unpublished, closed, or the link may be wrong. Nothing about this shop is
            shown while it is offline.
          </p>
          <Button asChild className="mt-2">
            <Link to="/market">Browse the marketplace</Link>
          </Button>
        </div>
      </MarketShell>
    );
  }

  const whatsappDigits = (shop.whatsapp ?? "").replace(/[^0-9]/g, "");
  const location = [shop.city, shop.region, shop.country].filter(Boolean).join(", ");

  return (
    <MarketShell back={{ to: "/market", label: "Marketplace" }}>
      <section className="border-b border-[var(--brand-line)] bg-[radial-gradient(100%_120%_at_20%_-20%,rgba(16,185,129,0.16),transparent_60%)]">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-primary)]">
                Shop
              </p>
              <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl">
                {shop.name}
              </h1>
              {shop.description ? (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {shop.description}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden /> {location}
                  </span>
                ) : null}
                {shop.phone ? (
                  <a
                    href={`tel:${shop.phone}`}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <Phone className="size-3.5" aria-hidden /> {shop.phone}
                  </a>
                ) : null}
                {shop.email ? (
                  <a
                    href={`mailto:${shop.email}`}
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <Mail className="size-3.5" aria-hidden /> {shop.email}
                  </a>
                ) : null}
                {whatsappDigits ? (
                  <a
                    href={`https://wa.me/${whatsappDigits}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-foreground"
                  >
                    <MessageCircle className="size-3.5" aria-hidden /> WhatsApp
                  </a>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <Truck className="size-3.5 text-[var(--brand-primary)]" aria-hidden />
                Delivery
              </p>
              {delivery.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {Array.from(new Set(delivery.map((zone) => zone.kind))).map((kind) => (
                    <span
                      key={kind}
                      className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground"
                    >
                      {DELIVERY_SHORT[kind]}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-muted-foreground">Collection only</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6">
        <div className="relative max-w-md">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${shop.name}`}
            aria-label={`Search ${shop.name}`}
            className="h-11 rounded-full pl-10"
            autoComplete="off"
          />
        </div>
        {delivery.length > 0 ? (
          <details className="mt-3 rounded-lg border border-[var(--brand-line)] px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium">Delivery options</summary>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              {delivery.map((zone) => (
                <li key={zone.id}>
                  {[
                    zone.kind === "worldwide"
                      ? "Worldwide"
                      : zone.kind === "nationwide"
                        ? "Nationwide"
                        : "Local",
                  ]
                    .concat(zone.country ? ` — ${zone.country}` : "")
                    .concat(zone.region ? `, ${zone.region}` : "")
                    .concat(zone.city ? `, ${zone.city}` : "")}{" "}
                  · {feeLabel(zone.fee, shop.currency)}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-5 pb-28 sm:px-6">
        {feed.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="aspect-[3/4] animate-pulse rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)]"
              />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <ShoppingBag className="size-7 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">
              {debounced ? "Nothing matches that search" : "This shop has no products published"}
            </p>
            <p className="text-xs text-muted-foreground">
              {debounced ? "Try a shorter search." : "Check back later, or browse the marketplace."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <MarketProductCard
                  key={item.id}
                  item={item}
                  favourite={favourites.has(item.id)}
                  onToggleFavourite={
                    user
                      ? () =>
                          void toggleFavourite
                            .mutateAsync(item.id)
                            .catch((cause: unknown) =>
                              toast.error(
                                cause instanceof Error
                                  ? cause.message
                                  : "Could not save that product.",
                              ),
                            )
                      : undefined
                  }
                />
              ))}
            </div>
            {feed.hasNextPage ? (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={feed.isFetchingNextPage}
                  onClick={() => void feed.fetchNextPage()}
                >
                  {feed.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : null}
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>

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
              <ShoppingBag className="size-4" /> View basket
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
        originPath={`/shop/${slug}`}
      />
    </MarketShell>
  );
}
