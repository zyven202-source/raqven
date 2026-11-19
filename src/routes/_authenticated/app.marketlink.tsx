import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  MapPin,
  Package,
  Plus,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoticeState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { OwnerOnly } from "@/components/app/OwnerOnly";
import { StorageImage } from "@/components/app/StorageImage";
import { Field } from "@/components/app/fields";
import { ListingDialog } from "@/components/marketlink/ListingDialog";
import { OrderDetailSheet } from "@/components/marketlink/OrderDetailSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveShop } from "@/hooks/useActiveShop";
import {
  useAddDeliveryZone,
  useDeliveryZones,
  useMarketlinkListings,
  useMarketlinkNotifications,
  useMarkNotificationsRead,
  useRemoveDeliveryZone,
  useSellerOrders,
  useSetListingPublished,
  useSetStorefrontPublished,
  useStorefront,
  useSaveStorefront,
  useChangeShopSlug,
} from "@/hooks/useMarketlink";
import { useProducts } from "@/hooks/useProducts";
import { formatDateTime, formatMoney } from "@/lib/format";
import { zoneLabel } from "@/lib/marketlink";
import {
  DELIVERY_KINDS,
  slugIsAvailable,
  suggestSlug,
  type SellerOrder,
} from "@/services/marketlink.service";
import { MARKETLINK_STATUS_LABEL } from "@/types/marketlink";
import { STORAGE_BUCKETS, type MarketlinkDeliveryKind, type Product } from "@/types/savo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/marketlink")({
  head: () => ({ meta: [{ title: "SAVO — Marketlink" }] }),
  component: () => (
    <OwnerOnly title="Marketlink">
      <MarketlinkPage />
    </OwnerOnly>
  ),
});

/**
 * The seller's side of Marketlink.
 *
 * One screen, because a shopkeeper does not need five settings pages: the shop
 * window, its address, the products on it, how it delivers, and the requests that
 * arrived. Publishing requires an owner — employees can already run the till, but
 * putting the shop on the public internet is the owner's decision, and the
 * database enforces the same rule.
 */
function MarketlinkPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";

  const storefront = useStorefront(shopId);
  const listings = useMarketlinkListings(shopId);
  const zones = useDeliveryZones(shopId);
  const orders = useSellerOrders(shopId);
  const notifications = useMarketlinkNotifications(shopId);
  const markRead = useMarkNotificationsRead(shopId);
  const saveStorefront = useSaveStorefront(shopId);
  const setPublished = useSetStorefrontPublished(shopId);
  const setListingPublished = useSetListingPublished(shopId);
  const addZone = useAddDeliveryZone(shopId);
  const removeZone = useRemoveDeliveryZone(shopId);
  const changeSlug = useChangeShopSlug();
  const products = useProducts({ shopId, limit: 200, includeArchived: false });

  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [slug, setSlug] = useState(activeShop?.slug ?? "");
  const [slugBusy, setSlugBusy] = useState(false);
  const [origin, setOrigin] = useState("");

  const [listingTarget, setListingTarget] = useState<Product | null>(null);
  const [listingOpen, setListingOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<SellerOrder | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderFilter, setOrderFilter] = useState<"all" | "pending" | "accepted" | "completed">(
    "all",
  );

  const [zoneKind, setZoneKind] = useState<MarketlinkDeliveryKind>("local");
  const [zoneCountry, setZoneCountry] = useState("");
  const [zoneRegion, setZoneRegion] = useState("");
  const [zoneCity, setZoneCity] = useState("");
  const [zoneFee, setZoneFee] = useState("");
  const [zoneNote, setZoneNote] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    if (activeShop?.slug) setSlug((current) => current || activeShop.slug);
  }, [activeShop?.slug]);

  useEffect(() => {
    const saved = storefront.data;
    if (saved) {
      setDisplayName(saved.display_name);
      setDescription(saved.description ?? "");
      setPhone(saved.public_phone ?? "");
      setEmail(saved.public_email ?? "");
      setWhatsapp(saved.public_whatsapp ?? "");
      setCountry(saved.country ?? "");
      setRegion(saved.region ?? "");
      setCity(saved.city ?? "");
      setLatitude(saved.public_latitude !== null ? String(saved.public_latitude) : "");
      setLongitude(saved.public_longitude !== null ? String(saved.public_longitude) : "");
      return;
    }
    if (!storefront.isLoading) {
      setDisplayName((current) => current || activeShop?.name || "");
      setPhone((current) => current || activeShop?.phone || "");
      setCity((current) => current || activeShop?.location || "");
    }
  }, [
    storefront.data,
    storefront.isLoading,
    activeShop?.name,
    activeShop?.phone,
    activeShop?.location,
  ]);

  const listingByProduct = useMemo(() => {
    const map = new Map<string, NonNullable<typeof listings.data>[number]>();
    for (const listing of listings.data ?? []) map.set(listing.product_id, listing);
    return map;
  }, [listings]);

  const publishedListings = (listings.data ?? []).filter((listing) => listing.is_published);
  const pendingOrders = (orders.data ?? []).filter((order) => order.status === "pending");
  const unread = (notifications.data ?? []).filter((entry) => !entry.read_at);

  const filteredOrders = (orders.data ?? []).filter(
    (order) => orderFilter === "all" || order.status === orderFilter,
  );

  const publicUrl = slug ? `${origin}/shop/${slug}` : "";

  async function saveDetails() {
    if (displayName.trim().length < 2) {
      toast.error("Give your shop a public name.");
      return;
    }
    const lat = latitude.trim() === "" ? null : Number(latitude);
    const lng = longitude.trim() === "" ? null : Number(longitude);
    if ((lat === null) !== (lng === null)) {
      toast.error("Enter both coordinates, or neither.");
      return;
    }
    if (lat !== null && (!Number.isFinite(lat) || !Number.isFinite(lng))) {
      toast.error("Those coordinates are not numbers.");
      return;
    }
    try {
      await saveStorefront.mutateAsync({
        display_name: displayName.trim(),
        description: description.trim() || null,
        public_phone: phone.trim() || null,
        public_email: email.trim() || null,
        public_whatsapp: whatsapp.trim() || null,
        country: country.trim() || null,
        region: region.trim() || null,
        city: city.trim() || null,
        public_latitude: lat,
        public_longitude: lng,
      });
      toast.success("Storefront details saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the storefront.");
    }
  }

  async function saveSlug() {
    const next = slug.trim().toLowerCase();
    if (next === activeShop?.slug) {
      toast("That is already your address.");
      return;
    }
    setSlugBusy(true);
    try {
      const available = await slugIsAvailable(next);
      if (!available) {
        toast.error("That address is taken or reserved. Try another.");
        return;
      }
      await changeSlug.mutateAsync({ shopId, slug: next });
      setSlug(next);
      toast.success("Shop address updated", { description: `${next} is now your public link.` });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change the address.");
    } finally {
      setSlugBusy(false);
    }
  }

  async function toggleStorefront(next: boolean) {
    if (next && publishedListings.length === 0) {
      toast.error("Publish at least one product before opening the shop.");
      return;
    }
    try {
      await setPublished.mutateAsync(next);
      toast.success(next ? "Your shop is live on Marketlink" : "Your shop is hidden");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change visibility.");
    }
  }

  async function addDelivery() {
    const fee = zoneFee.trim() === "" ? null : Number(zoneFee);
    if (fee !== null && (!Number.isFinite(fee) || fee < 0)) {
      toast.error("Enter a delivery fee of zero or more, or leave it blank.");
      return;
    }
    if (zoneKind === "nationwide" && !zoneCountry.trim()) {
      toast.error("Nationwide delivery needs a country.");
      return;
    }
    if (zoneKind === "local" && !zoneRegion.trim() && !zoneCity.trim()) {
      toast.error("Local delivery needs a county/region or town.");
      return;
    }
    try {
      await addZone.mutateAsync({
        shop_id: shopId,
        kind: zoneKind,
        country: zoneKind === "worldwide" ? zoneCountry.trim() || null : zoneCountry.trim() || null,
        region: zoneKind === "local" ? zoneRegion.trim() || null : null,
        city: zoneKind === "local" ? zoneCity.trim() || null : null,
        fee,
        note: zoneNote.trim() || null,
      });
      setZoneCountry("");
      setZoneRegion("");
      setZoneCity("");
      setZoneFee("");
      setZoneNote("");
      toast.success("Delivery option added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the delivery option.");
    }
  }

  if (storefront.isLoading || products.isLoading) {
    return <LoadingState label="Opening Marketlink…" />;
  }
  if (storefront.isError) {
    return (
      <PageContainer>
        <PageHeader eyebrow="Marketlink" title="Your public shop" />
        <ErrorState message={storefront.error.message} onRetry={() => void storefront.refetch()} />
      </PageContainer>
    );
  }

  const isLive = storefront.data?.is_published === true;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Marketlink"
        title="Your public shop"
        subtitle="Sell from your real stock, take order requests, and keep the till as the only place a sale happens."
        action={
          <Button asChild variant="outline" className="h-10">
            <Link to="/market">Marketplace</Link>
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-2">
        <Stat label="Live products" value={publishedListings.length} />
        <Stat label="New requests" value={pendingOrders.length} />
        <Stat label="Delivery options" value={(zones.data ?? []).length} />
      </div>

      {unread.length > 0 ? (
        <div className="mb-5 rounded-xl border border-[var(--brand-accent)]/40 bg-[var(--brand-accent)]/10 p-3.5">
          <div className="flex items-start gap-2.5">
            <Bell className="mt-0.5 size-4 shrink-0 text-[var(--brand-accent)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {unread.length} new order request{unread.length === 1 ? "" : "s"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{unread[0]?.title}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    setOrderFilter("pending");
                    document
                      .getElementById("marketlink-orders")
                      ?.scrollIntoView({ block: "start" });
                  }}
                >
                  Review
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={markRead.isPending}
                  onClick={() => void markRead.mutate()}
                >
                  Mark all read
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------- storefront */}
      <section className="card-surface p-4">
        <SectionTitle
          icon={<Store className="size-4" aria-hidden />}
          title="The shop window"
          description="What a customer sees before they browse your products."
        />

        <div className="mt-3 space-y-3">
          <Field label="Public shop name" htmlFor="mk-display-name">
            <Input
              id="mk-display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="h-11"
              maxLength={80}
            />
          </Field>
          <Field
            label="Description"
            hint="Optional. Two sentences is plenty."
            htmlFor="mk-description"
          >
            <textarea
              id="mk-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={1200}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
            <Field label="Public phone" htmlFor="mk-phone-public">
              <Input
                id="mk-phone-public"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                inputMode="tel"
                className="h-11"
              />
            </Field>
            <Field label="Public email" htmlFor="mk-email-public">
              <Input
                id="mk-email-public"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="h-11"
              />
            </Field>
            <Field label="WhatsApp" htmlFor="mk-wa">
              <Input
                id="mk-wa"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
                inputMode="tel"
                className="h-11"
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 [&>*]:min-w-0">
            <Field label="Country" htmlFor="mk-country">
              <Input
                id="mk-country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                className="h-11"
                placeholder="Kenya"
              />
            </Field>
            <Field label="County / region" htmlFor="mk-region">
              <Input
                id="mk-region"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                className="h-11"
                placeholder="Garissa"
              />
            </Field>
            <Field label="Town / city" htmlFor="mk-city">
              <Input
                id="mk-city"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className="h-11"
              />
            </Field>
          </div>

          <details className="rounded-lg border border-[var(--brand-line)] p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Approximate map location
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Optional. Used only to sort your shop into “near me” results. Publish a rough point (a
              town centre), never your home. No distance is shown unless both you and the customer
              share coordinates.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <Field label="Latitude" htmlFor="mk-lat">
                <Input
                  id="mk-lat"
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                  inputMode="decimal"
                  className="tnum h-11"
                  placeholder="-1.2833"
                />
              </Field>
              <Field label="Longitude" htmlFor="mk-lng">
                <Input
                  id="mk-lng"
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                  inputMode="decimal"
                  className="tnum h-11"
                  placeholder="36.8167"
                />
              </Field>
            </div>
          </details>

          <div className="flex flex-wrap gap-2">
            <Button
              className="h-11"
              disabled={saveStorefront.isPending}
              onClick={() => void saveDetails()}
            >
              {saveStorefront.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Save details
            </Button>
            <Button
              variant={isLive ? "outline" : "default"}
              className="h-11"
              disabled={setPublished.isPending}
              onClick={() => void toggleStorefront(!isLive)}
            >
              {isLive ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {isLive ? "Unpublish shop" : "Publish shop"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {isLive
              ? "Your shop and its published products are visible on the public marketplace."
              : "Your shop is hidden. Nothing here is visible to customers until you publish."}
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------- branded URL */}
      <section className="card-surface mt-4 p-4">
        <SectionTitle
          icon={<ExternalLink className="size-4" aria-hidden />}
          title="Your shop address"
          description="A readable link you can share. Never a random identifier."
        />

        <div className="mt-3 space-y-3">
          <Field
            label="Address"
            hint="Lowercase letters, numbers and single hyphens. Changing it breaks old links."
            htmlFor="mk-slug"
          >
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-sm text-muted-foreground">{origin}/shop/</span>
              <Input
                id="mk-slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
                className="h-11 min-w-0 flex-1"
                maxLength={60}
                autoComplete="off"
              />
            </div>
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="h-10"
              disabled={slugBusy}
              onClick={() => {
                const suggestion = suggestSlug(displayName || activeShop?.name || "");
                if (suggestion.length >= 3) setSlug(suggestion);
              }}
            >
              Use shop name
            </Button>
            <Button className="h-10" disabled={slugBusy} onClick={() => void saveSlug()}>
              {slugBusy ? <Loader2 className="size-4 animate-spin" /> : null}
              Save address
            </Button>
            <Button
              variant="outline"
              className="h-10"
              onClick={() => {
                void navigator.clipboard
                  .writeText(publicUrl)
                  .then(() => toast.success("Link copied"))
                  .catch(() => toast.error("Could not copy the link."));
              }}
            >
              <Copy className="size-4" /> Copy link
            </Button>
            <Button asChild variant="ghost" className="h-10">
              <Link to="/shop/$slug" params={{ slug }} target="_blank">
                <ExternalLink className="size-4" /> Open
              </Link>
            </Button>
          </div>
          <p className="truncate text-xs text-muted-foreground">{publicUrl}</p>
        </div>
      </section>

      {/* ----------------------------------------------------------- products */}
      <section className="mt-6">
        <SectionTitle
          icon={<ShoppingBag className="size-4" aria-hidden />}
          title="Products on Marketlink"
          description="Every listing is one of your real inventory products, with a photo you uploaded."
        />

        {products.isError ? (
          <ErrorState message={products.error.message} onRetry={() => void products.refetch()} />
        ) : (products.data ?? []).length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Add products in Inventory first. Marketlink publishes from your existing stock."
            action={
              <Button asChild>
                <Link to="/app/inventory" search={{ shop: undefined }}>
                  Open inventory
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="list-divided mt-3">
            {(products.data ?? []).map((product) => {
              const listing = listingByProduct.get(product.id);
              return (
                <li key={product.id} className="flex items-center gap-3 py-3">
                  <StorageImage
                    bucket={STORAGE_BUCKETS.productImages}
                    path={product.image_url}
                    alt=""
                    className="size-12 shrink-0 rounded-md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="tnum mt-0.5 text-xs text-muted-foreground">
                      {Number(product.quantity)} {product.unit} ·{" "}
                      {formatMoney(product.selling_price, currency)}
                    </p>
                    <p className="mt-1 text-[11px]">
                      {listing?.is_published ? (
                        <span className="font-medium text-positive">Live on Marketlink</span>
                      ) : listing ? (
                        <span className="text-muted-foreground">Saved, hidden</span>
                      ) : (
                        <span className="text-caution">Not published · needs a photo</span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => {
                        setListingTarget(product);
                        setListingOpen(true);
                      }}
                    >
                      {listing ? "Edit" : "Publish"}
                    </Button>
                    {listing ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        disabled={setListingPublished.isPending}
                        onClick={() => {
                          const next = !listing.is_published;
                          if (next && !listing.image_path) {
                            toast.error("Upload a photo before publishing.");
                            return;
                          }
                          void setListingPublished
                            .mutateAsync({ id: listing.id, published: next })
                            .then(() =>
                              toast.success(
                                next ? `${product.name} is live` : `${product.name} hidden`,
                              ),
                            )
                            .catch((error: unknown) =>
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Could not update the listing.",
                              ),
                            );
                        }}
                      >
                        {listing.is_published ? "Hide" : "Show"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ----------------------------------------------------------- delivery */}
      <section className="mt-6">
        <SectionTitle
          icon={<Truck className="size-4" aria-hidden />}
          title="Delivery"
          description="Only the options you add here are offered to customers. Leave the fee blank when you confirm it yourself."
        />

        {(zones.data ?? []).length > 0 ? (
          <ul className="mt-3 divide-y divide-[var(--brand-line)] border-y border-[var(--brand-line)]">
            {(zones.data ?? []).map((zone) => (
              <li key={zone.id} className="flex items-center gap-3 py-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[var(--brand-surface)] text-[var(--brand-primary)]">
                  <MapPin className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{zoneLabel(zone)}</p>
                  <p className="tnum text-xs text-muted-foreground">
                    {zone.fee === null ? "Fee confirmed by you" : formatMoney(zone.fee, currency)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-negative"
                  disabled={removeZone.isPending}
                  onClick={() =>
                    void removeZone
                      .mutateAsync(zone.id)
                      .then(() => toast.success("Delivery option removed"))
                      .catch((error: unknown) =>
                        toast.error(
                          error instanceof Error ? error.message : "Could not remove the option.",
                        ),
                      )
                  }
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <NoticeState
            title="No delivery options yet"
            description="Customers can still request collection. Add local, nationwide or worldwide delivery when you are ready."
          />
        )}

        <div className="card-surface mt-3 space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Type" htmlFor="zone-kind">
              <Select
                value={zoneKind}
                onValueChange={(value) => setZoneKind(value as MarketlinkDeliveryKind)}
              >
                <SelectTrigger id="zone-kind" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DELIVERY_KINDS.map((kind) => (
                    <SelectItem key={kind.value} value={kind.value}>
                      {kind.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              label={zoneKind === "worldwide" ? "Country (optional)" : "Country"}
              htmlFor="zone-country"
            >
              <Input
                id="zone-country"
                value={zoneCountry}
                onChange={(event) => setZoneCountry(event.target.value)}
                className="h-11"
                placeholder="Kenya"
              />
            </Field>
          </div>

          {zoneKind === "local" ? (
            <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
              <Field label="County / region" htmlFor="zone-region">
                <Input
                  id="zone-region"
                  value={zoneRegion}
                  onChange={(event) => setZoneRegion(event.target.value)}
                  className="h-11"
                  placeholder="Garissa"
                />
              </Field>
              <Field label="Town / city" hint="Optional." htmlFor="zone-city">
                <Input
                  id="zone-city"
                  value={zoneCity}
                  onChange={(event) => setZoneCity(event.target.value)}
                  className="h-11"
                />
              </Field>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="Fee" hint={`In ${currency}. Blank = you confirm it.`} htmlFor="zone-fee">
              <Input
                id="zone-fee"
                value={zoneFee}
                onChange={(event) => setZoneFee(event.target.value)}
                inputMode="decimal"
                className="tnum h-11"
              />
            </Field>
            <Field
              label="Note"
              hint="Optional. E.g. two days, town centre pickup."
              htmlFor="zone-note"
            >
              <Input
                id="zone-note"
                value={zoneNote}
                onChange={(event) => setZoneNote(event.target.value)}
                className="h-11"
                maxLength={400}
              />
            </Field>
          </div>

          <Button
            variant="outline"
            className="h-11 w-full"
            disabled={addZone.isPending}
            onClick={() => void addDelivery()}
          >
            <Plus className="size-4" /> Add delivery option
          </Button>
        </div>
      </section>

      {/* ------------------------------------------------------------- orders */}
      <section id="marketlink-orders" className="mt-6 scroll-mt-20">
        <SectionTitle
          icon={<Package className="size-4" aria-hidden />}
          title="Order requests"
          description="Requests, not sales. Complete the sale at the till so stock and receipts stay correct."
        />

        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {(["pending", "accepted", "completed", "all"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setOrderFilter(filter)}
              aria-pressed={orderFilter === filter}
              className={cn(
                "press h-9 shrink-0 rounded-full border px-3.5 text-xs font-medium",
                orderFilter === filter
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[#04140e]"
                  : "border-[var(--brand-line)] text-muted-foreground",
              )}
            >
              {filter === "all" ? "All" : MARKETLINK_STATUS_LABEL[filter]}
            </button>
          ))}
        </div>

        {orders.isLoading ? (
          <LoadingState label="Loading requests…" />
        ) : filteredOrders.length === 0 ? (
          <EmptyState
            title="No requests here"
            description="When a customer sends an order request from your public shop, it appears in this list with their contact details."
          />
        ) : (
          <ul className="list-divided">
            {filteredOrders.map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOrder(order);
                    setOrderOpen(true);
                  }}
                  className="press flex w-full items-center gap-3 py-3 text-left"
                >
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-[var(--brand-surface)] text-[var(--brand-primary)]">
                    <Package className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="tnum text-sm font-semibold">{order.reference}</span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
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
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {order.customer_name} · {order.items.length} item
                      {order.items.length === 1 ? "" : "s"} · {formatDateTime(order.created_at)}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-sm font-semibold">
                    {formatMoney(order.subtotal, order.currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ListingDialog
        shopId={shopId}
        product={listingTarget}
        listing={listingTarget ? (listingByProduct.get(listingTarget.id) ?? null) : null}
        open={listingOpen}
        onOpenChange={(open) => {
          setListingOpen(open);
          if (!open) setListingTarget(null);
        }}
      />

      <OrderDetailSheet
        shopId={shopId}
        order={selectedOrder}
        open={orderOpen}
        onOpenChange={(open) => {
          setOrderOpen(open);
          if (!open) setSelectedOrder(null);
        }}
      />

      <p className="mt-8 flex items-center justify-center gap-1.5 pb-2 text-center text-[11px] text-muted-foreground">
        <Check className="size-3.5 text-positive" aria-hidden />
        Marketlink never marks a request as paid and never deducts stock.
      </p>
    </PageContainer>
  );
}

function SectionTitle({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
        <span className="text-[var(--brand-primary)]">{icon}</span>
        {title}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[var(--brand-line)] bg-[var(--brand-raised)] p-3">
      <p className="tnum text-xl font-semibold text-foreground">{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{label}</p>
    </div>
  );
}
