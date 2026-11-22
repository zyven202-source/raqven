import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Heart, Loader2, Search, SlidersHorizontal, Store, X } from "lucide-react";
import { toast } from "sonner";

import { MarketProductCard } from "@/components/marketlink/MarketProductCard";
import { MarketShell } from "@/components/marketlink/MarketShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useFavouriteIds,
  useMarketCategories,
  useMarketFeed,
  useMyFavourites,
  usePublicShops,
  useToggleFavourite,
} from "@/hooks/useMarketlink";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSession } from "@/hooks/useSession";
import { pageMeta } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { MarketFeedItem, MarketFeedSort } from "@/types/marketlink";

export const Route = createFileRoute("/market")({
  head: () =>
    pageMeta({
      title: "SAVO Marketlink — shop independent sellers online",
      description:
        "Browse products published by real SAVO shops, see current prices and availability, and send an order request to the seller.",
      path: "/market",
    }),
  component: MarketPage,
});

type GeoState = "idle" | "asking" | "on" | "denied" | "unavailable";

const INTRO_KEY = "savo:market-intro-dismissed";

/**
 * The one-time explanation of what SAVO and SAVO Market each do.
 *
 * Deliberately a short band rather than a multi-step tour: a returning visitor
 * dismisses it once and never sees it again, and a customer who came for a
 * product can ignore it entirely.
 */
function MeetSavoMarket() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(INTRO_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(INTRO_KEY, "1");
    } catch {
      /* Private mode: it simply reappears next visit. */
    }
  }

  return (
    <section
      aria-labelledby="meet-savo-market"
      className="border-b border-[var(--brand-line)] bg-[var(--brand-surface)]"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        <div className="relative rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] p-4 pr-11 sm:p-5 sm:pr-12">
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss the SAVO Market introduction"
            className="press absolute right-2 top-2 grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[var(--brand-surface)] hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>

          <h2 id="meet-savo-market" className="font-display text-base font-semibold sm:text-lg">
            Meet SAVO Market
          </h2>
          <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
            SAVO helps businesses manage their sales, stock, expenses and daily operations. SAVO
            Market connects sellers with customers looking for products.
          </p>
          <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Sellers publish real products with current prices and actual availability. Customers
            browse without an account, compare what is available, and send orders to the seller who
            fulfils them.
          </p>

          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[11px] font-medium text-foreground/80 sm:text-xs">
            <li>· Every listing comes from an authorized seller</li>
            <li>· Prices and stock are checked when you order</li>
            <li>· One order per seller, tracked separately</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

/**
 * The shared marketplace.
 *
 * Every card is a published listing over a real inventory product, loaded a page
 * at a time. Search and filters run in the database, not over a downloaded
 * catalogue. Nearby sorting is opt-in, coarse, and never invents a distance: it
 * only ranks when the seller published an approximate location AND the visitor
 * shared coordinates.
 */
function MarketPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [category, setCategory] = useState("");
  const [shopSlug, setShopSlug] = useState("");
  const [inStock, setInStock] = useState(true);
  const [maxPrice, setMaxPrice] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<MarketFeedSort>("relevance");
  const [savedOnly, setSavedOnly] = useState(false);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [geoState, setGeoState] = useState<GeoState>("idle");

  const { user } = useSession();
  const favouriteIds = useFavouriteIds(Boolean(user));
  const favourites = useMemo(() => new Set(favouriteIds.data ?? []), [favouriteIds.data]);
  const toggleFavourite = useToggleFavourite();
  const saved = useMyFavourites(Boolean(user) && savedOnly);

  const categories = useMarketCategories();
  const shops = usePublicShops();

  const parsedMax = maxPrice.trim() === "" ? undefined : Number(maxPrice);
  const filters = useMemo(
    () => ({
      ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      ...(category ? { category } : {}),
      ...(shopSlug ? { shopSlug } : {}),
      ...(parsedMax !== undefined && Number.isFinite(parsedMax) ? { maxPrice: parsedMax } : {}),
      ...(country.trim() ? { country: country.trim() } : {}),
      ...(region.trim() ? { region: region.trim() } : {}),
      ...(inStock ? { inStock: true } : {}),
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      ...(sort !== "relevance" ? { sort } : {}),
      limit: 24,
    }),
    [debouncedSearch, category, shopSlug, parsedMax, country, region, inStock, coords, sort],
  );

  const feed = useMarketFeed(filters);
  const items = savedOnly
    ? (saved.data ?? [])
    : (feed.data?.pages.flatMap((page) => page.items) ?? []);
  const loading = savedOnly ? saved.isLoading : feed.isLoading;
  const error = savedOnly ? saved.error : feed.error;
  const hasFilters = Boolean(
    debouncedSearch || category || shopSlug || parsedMax !== undefined || country || region,
  );

  function askForLocation() {
    if (!("geolocation" in navigator)) {
      setGeoState("unavailable");
      return;
    }
    setGeoState("asking");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          lat: Number(position.coords.latitude.toFixed(4)),
          lng: Number(position.coords.longitude.toFixed(4)),
        });
        setGeoState("on");
      },
      () => {
        setGeoState("denied");
        setSort("relevance");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  /** Sorting by distance is only ever offered after the visitor opts in. */
  function chooseNearby() {
    setSort("nearby");
    if (!coords) askForLocation();
  }

  function save(item: MarketFeedItem) {
    void toggleFavourite
      .mutateAsync(item.id)
      .then((nowSaved) =>
        toast.success(nowSaved ? `Saved ${item.name}` : `Removed ${item.name} from saved`),
      )
      .catch((cause: unknown) =>
        toast.error(cause instanceof Error ? cause.message : "Could not save that product."),
      );
  }

  function retry() {
    if (savedOnly) void saved.refetch();
    else void feed.refetch();
  }

  function clearFilters() {
    setSearch("");
    setCategory("");
    setShopSlug("");
    setInStock(true);
    setMaxPrice("");
    setCountry("");
    setRegion("");
    setCoords(null);
    setGeoState("idle");
    setSort("relevance");
  }

  return (
    <MarketShell>
      <section className="relative isolate overflow-hidden border-b border-[var(--brand-line)] bg-[radial-gradient(90%_120%_at_50%_-20%,rgba(16,185,129,0.18),transparent_60%)]">
        {/* A real shop, not a gradient: shelves and merchandise behind a scrim
            dark enough for emerald and cream text. The gradient underneath is
            the fallback if the photograph fails to load. */}
        <img
          src="/market/hero.jpg"
          alt=""
          aria-hidden
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 -z-10 size-full object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[linear-gradient(100deg,rgba(4,20,14,0.92)_0%,rgba(4,20,14,0.78)_45%,rgba(4,20,14,0.52)_100%)]"
        />
        <div className="mx-auto w-full max-w-6xl px-4 pb-8 pt-10 sm:px-6 sm:pt-14">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--brand-primary)]">
            SAVO Market
          </p>
          <h1 className="mt-3 max-w-2xl font-display text-3xl font-semibold leading-tight text-cream sm:text-5xl">
            Shop every SAVO seller in one place.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-cream/75 sm:text-base">
            Real sellers, real stock. Prices and availability come from each seller&rsquo;s own
            inventory, and every request goes straight to them.
          </p>

          <div className="mt-6 flex max-w-2xl gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products, categories or sellers"
                aria-label="Search the marketplace"
                className="h-12 rounded-full border-cream/20 bg-[var(--brand-surface)]/90 pl-10 backdrop-blur"
                autoComplete="off"
                enterKeyHint="search"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="press absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-muted-foreground"
                >
                  <X className="size-4" aria-hidden />
                </button>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-12 w-12 shrink-0 rounded-full border-cream/20 p-0"
              aria-label="Filters"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((value) => !value)}
            >
              <SlidersHorizontal className="size-5" aria-hidden />
            </Button>
          </div>
          <p className="mt-3 text-[10px] text-cream/45">Shop photograph by Zooey Li on Unsplash.</p>
        </div>
      </section>

      <MeetSavoMarket />

      {filtersOpen ? (
        <section className="border-b border-[var(--brand-line)] bg-[var(--brand-surface)]">
          <div className="mx-auto grid w-full max-w-6xl gap-3 px-4 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            <label className="block text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">Seller</span>
              <Select
                value={shopSlug || "all"}
                onValueChange={(value) => setShopSlug(value === "all" ? "" : value)}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sellers</SelectItem>
                  {(shops.data ?? []).map((shop) => (
                    <SelectItem key={shop.slug} value={shop.slug}>
                      {shop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            <label className="block text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">Maximum price</span>
              <Input
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
                inputMode="decimal"
                className="tnum h-11"
                placeholder="Any price"
              />
            </label>

            <label className="block text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">
                Deliver to country
              </span>
              <Input
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="h-11"
                placeholder="Any country"
              />
            </label>

            <label className="block text-xs">
              <span className="mb-1 block font-medium text-muted-foreground">County / region</span>
              <Input
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                className="h-11"
                placeholder="Anywhere"
              />
            </label>

            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
              <button
                type="button"
                aria-pressed={inStock}
                onClick={() => setInStock((value) => !value)}
                className={cn(
                  "press h-9 rounded-full border px-3.5 text-xs font-medium",
                  inStock
                    ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[#04140e]"
                    : "border-[var(--brand-line)] text-muted-foreground",
                )}
              >
                In stock only
              </button>
              {hasFilters || coords ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Clear all
                </button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* --------------------------------------------------------- categories */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6">
        <div className="flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            aria-pressed={!category}
            onClick={() => setCategory("")}
            className={cn(
              "press h-9 shrink-0 rounded-full border px-3.5 text-xs font-medium",
              !category
                ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[#04140e]"
                : "border-[var(--brand-line)] text-muted-foreground",
            )}
          >
            All products
          </button>
          {(categories.data ?? []).map((entry) => (
            <button
              key={entry.name}
              type="button"
              aria-pressed={category === entry.name}
              onClick={() => setCategory((current) => (current === entry.name ? "" : entry.name))}
              className={cn(
                "press h-9 shrink-0 rounded-full border px-3.5 text-xs font-medium",
                category === entry.name
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[#04140e]"
                  : "border-[var(--brand-line)] text-muted-foreground",
              )}
            >
              {entry.name}
              <span className="tnum ml-1 opacity-60">{entry.count}</span>
            </button>
          ))}
        </div>
      </section>

      {/* --------------------------------------------------------- ordering */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              ["relevance", "Recommended"],
              ["newest", "New arrivals"],
              ["nearby", "Near me"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={sort === value}
              onClick={() => {
                if (value !== "nearby") {
                  setSort(value);
                  return;
                }
                if (sort === "nearby") {
                  setSort("relevance");
                  setCoords(null);
                  setGeoState("idle");
                  return;
                }
                chooseNearby();
              }}
              className={cn(
                "press h-9 rounded-full border px-3.5 text-xs font-medium",
                sort === value
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[#04140e]"
                  : "border-[var(--brand-line)] text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
          {user ? (
            <button
              type="button"
              aria-pressed={savedOnly}
              onClick={() => setSavedOnly((value) => !value)}
              className={cn(
                "press ml-auto flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium",
                savedOnly
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[#04140e]"
                  : "border-[var(--brand-line)] text-muted-foreground",
              )}
            >
              <Heart className={cn("size-3.5", savedOnly ? "fill-current" : "")} aria-hidden />
              Saved
            </button>
          ) : null}
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          {geoState === "denied"
            ? "Location permission was declined. You can still search, and pick a country or county above."
            : geoState === "unavailable"
              ? "This browser cannot share a location. Search and the country filters still work."
              : geoState === "asking"
                ? "Waiting for your location permission. Nothing is sorted until you allow it."
                : sort === "newest"
                  ? "Newest first, by the time each seller published the product."
                  : sort === "nearby"
                    ? "Buyable products from shops that published a location, nearest first. Your location is used once for this sort and is not tracked."
                    : "Recommended: what you can buy now, then nearest when you share a location, then newest."}
        </p>
      </section>

      {/* ------------------------------------------------------------- feed */}
      <section className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="aspect-[3/4] animate-pulse rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)]"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl border border-negative/30 bg-negative-soft/40 p-5 text-center">
            <p className="text-sm font-medium text-negative">The marketplace could not load.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {error instanceof Error ? error.message : "Check your connection."}
            </p>
            <Button className="mt-3 h-10" onClick={retry}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] px-5 py-14 text-center">
            <Store className="size-7 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">
              {savedOnly
                ? "Nothing saved yet"
                : hasFilters || coords
                  ? "Nothing matches those filters"
                  : "No shops are live yet"}
            </p>
            <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
              {savedOnly
                ? "Tap the heart on a product to keep it here."
                : hasFilters || coords
                  ? "Try a broader search, or clear the filters."
                  : "Shops appear here after they publish a product on Marketlink."}
            </p>
            {savedOnly ? (
              <Button variant="outline" className="mt-2 h-9" onClick={() => setSavedOnly(false)}>
                Browse all products
              </Button>
            ) : hasFilters || coords ? (
              <Button variant="outline" className="mt-2 h-9" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button asChild variant="outline" className="mt-2 h-9">
                <Link to="/auth/signup">Open your shop</Link>
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {items.length} {savedOnly ? "saved " : ""}product{items.length === 1 ? "" : "s"}{" "}
                shown
              </p>
              {coords ? (
                <p className="text-[11px] text-muted-foreground">Sorted by distance first</p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((item) => (
                <MarketProductCard
                  key={item.id}
                  item={item}
                  favourite={favourites.has(item.id)}
                  onToggleFavourite={user ? () => save(item) : undefined}
                />
              ))}
            </div>

            {!savedOnly && feed.hasNextPage ? (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={feed.isFetchingNextPage}
                  onClick={() => void feed.fetchNextPage()}
                >
                  {feed.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : null}
                  Load more products
                </Button>
              </div>
            ) : !savedOnly ? (
              <p className="mt-6 text-center text-xs text-muted-foreground">
                You have reached the end of the marketplace.
              </p>
            ) : null}
          </>
        )}
      </section>
    </MarketShell>
  );
}
