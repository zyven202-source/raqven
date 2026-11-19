/**
 * Marketlink data access.
 *
 * Two rules hold everywhere in this file:
 *
 *   1. Public reads go through the `marketlink_*` RPCs. No anonymous visitor is
 *      ever given a query that can reach a table, so there is nothing to leak by
 *      guessing a filter.
 *   2. Seller writes go through RLS on the marketlink tables. The client sends
 *      the shop id; PostgreSQL checks that the caller owns it.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { uploadImage, removeObject } from "@/services/storage.service";
import { STORAGE_BUCKETS } from "@/types/savo";
import type {
  MarketlinkCustomerProfile,
  MarketlinkDeliveryKind,
  MarketlinkDeliveryZone,
  MarketlinkDeliveryZoneInsert,
  MarketlinkListing,
  MarketlinkListingUpdate,
  MarketlinkNotification,
  MarketlinkOrder,
  MarketlinkOrderItem,
  MarketlinkStorefront,
  MarketlinkStorefrontUpdate,
} from "@/types/savo";
import type {
  CustomerOrder,
  MarketCategory,
  MarketFeedItem,
  MarketFeedSort,
  MarketFeedResult,
  PublicProductPayload,
  PublicShopPayload,
  SubmitOrderInput,
  SubmitOrderResult,
} from "@/types/marketlink";

function isMissing(value: unknown): value is null {
  return value === null || value === undefined;
}

/** Untyped JSON out of a database function, narrowed once at the edge. */
function asJson<T>(value: unknown): T {
  return value as T;
}

export interface ListingWithProduct extends MarketlinkListing {
  product: {
    id: string;
    name: string;
    unit: string;
    selling_price: number;
    quantity: number;
    low_stock_threshold: number;
    image_url: string | null;
    is_active: boolean;
  } | null;
}

// ------------------------------------------------------------------ storefront

export async function getStorefront(shopId: string): Promise<MarketlinkStorefront | null> {
  const { data, error } = await supabase
    .from("marketlink_storefronts")
    .select("*")
    .eq("shop_id", shopId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveStorefront(
  shopId: string,
  patch: MarketlinkStorefrontUpdate,
): Promise<MarketlinkStorefront> {
  // Update when the row exists; insert only when there is a public name to
  // create it with. An upsert would require `display_name` on every call, which
  // would make "publish" fail for a shop that had never opened the form.
  const existing = await getStorefront(shopId);
  if (existing) {
    const { data, error } = await supabase
      .from("marketlink_storefronts")
      .update(patch)
      .eq("shop_id", shopId)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  const displayName = patch.display_name?.trim();
  if (!displayName) {
    throw new Error("Save your public shop name before publishing.");
  }

  const { data, error } = await supabase
    .from("marketlink_storefronts")
    .insert({ ...patch, shop_id: shopId, display_name: displayName })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function setStorefrontPublished(
  shopId: string,
  published: boolean,
): Promise<MarketlinkStorefront> {
  return saveStorefront(shopId, {
    is_published: published,
    published_at: published ? new Date().toISOString() : null,
  });
}

// --------------------------------------------------------------------- listings

const LISTING_SELECT =
  "*, product:products(id, name, unit, selling_price, quantity, low_stock_threshold, image_url, is_active)";

export async function listListings(shopId: string): Promise<ListingWithProduct[]> {
  const { data, error } = await supabase
    .from("marketlink_listings")
    .select(LISTING_SELECT)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return asJson<ListingWithProduct[]>(data ?? []);
}

export async function getListing(shopId: string, productId: string) {
  const { data, error } = await supabase
    .from("marketlink_listings")
    .select(LISTING_SELECT)
    .eq("shop_id", shopId)
    .eq("product_id", productId)
    .maybeSingle();
  if (error) throw error;
  return asJson<ListingWithProduct | null>(data);
}

export interface PublishListingInput {
  shopId: string;
  productId: string;
  description?: string | null;
  publicPrice?: number | null;
  category?: string | null;
  /** A file the owner just chose on this device. */
  file?: File | null;
  /** An already-uploaded path, when only the description or price changed. */
  imagePath?: string | null;
  isPublished: boolean;
}

/**
 * Uploads the genuine image the owner selected and writes the listing.
 *
 * The image is uploaded first on purpose: if it fails, no half-published row is
 * left behind. The old object is removed only after the new row is saved, so a
 * failure in between leaves a working (if stale) image rather than a broken one.
 */
export async function publishListing(input: PublishListingInput) {
  let imagePath = input.imagePath?.trim() || null;
  let uploaded: string | null = null;
  let previous: string | null = null;

  if (input.file) {
    uploaded = await uploadImage(STORAGE_BUCKETS.marketlink, input.shopId, input.file);
    imagePath = uploaded;
  }

  if (!imagePath) {
    throw new Error("Choose a photo of this product before publishing it.");
  }

  const existing = await getListing(input.shopId, input.productId);
  if (existing?.image_path && existing.image_path !== imagePath) previous = existing.image_path;

  const patch: MarketlinkListingUpdate = {
    description: input.description?.trim() || null,
    public_price: input.publicPrice ?? null,
    category: input.category?.trim() || null,
    image_path: imagePath,
    is_published: input.isPublished,
    ...(input.isPublished ? { published_at: new Date().toISOString() } : { published_at: null }),
  };

  const write = existing
    ? supabase
        .from("marketlink_listings")
        .update(patch)
        .eq("id", existing.id)
        .eq("shop_id", input.shopId)
        .select("*")
        .single()
    : supabase
        .from("marketlink_listings")
        .insert({
          ...patch,
          shop_id: input.shopId,
          product_id: input.productId,
          image_path: imagePath,
        })
        .select("*")
        .single();

  const { data, error } = await write;

  if (error) {
    // A stored image with no listing is an orphan; it is safe to remove because
    // this owner just uploaded it and the row never existed.
    if (uploaded) await removeObject(STORAGE_BUCKETS.marketlink, uploaded).catch(() => undefined);
    throw error;
  }

  if (previous) await removeObject(STORAGE_BUCKETS.marketlink, previous).catch(() => undefined);
  return data;
}

/**
 * Copies the shop's own inventory photo into the public marketplace bucket.
 *
 * This is the same photograph the shopkeeper already uploaded for the product —
 * not a stock image and not a linked URL. The marketplace bucket has to be
 * public-read for visitors without a session, while `product-images` stays
 * private, so the object is copied rather than referenced.
 */
export async function copyProductImage(shopId: string, sourcePath: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKETS.productImages)
    .createSignedUrl(sourcePath, 60);
  if (error || !data?.signedUrl) {
    throw new Error("That product photo could not be read. Upload it again instead.");
  }
  const response = await fetch(data.signedUrl);
  if (!response.ok) throw new Error("That product photo could not be read.");
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("That file is not an image.");
  const file = new File([blob], "product-photo", { type: blob.type });
  return uploadImage(STORAGE_BUCKETS.marketlink, shopId, file);
}

export async function setListingPublished(shopId: string, listingId: string, published: boolean) {
  const { data, error } = await supabase
    .from("marketlink_listings")
    .update({
      is_published: published,
      published_at: published ? new Date().toISOString() : null,
    })
    .eq("id", listingId)
    .eq("shop_id", shopId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// ----------------------------------------------------------------------- zones

export async function listDeliveryZones(shopId: string): Promise<MarketlinkDeliveryZone[]> {
  const { data, error } = await supabase
    .from("marketlink_delivery_zones")
    .select("*")
    .eq("shop_id", shopId)
    .order("kind")
    .order("country", { ascending: true, nullsFirst: true });
  if (error) throw error;
  return data ?? [];
}

export async function addDeliveryZone(input: MarketlinkDeliveryZoneInsert) {
  const { data, error } = await supabase
    .from("marketlink_delivery_zones")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function removeDeliveryZone(shopId: string, zoneId: string) {
  const { error } = await supabase
    .from("marketlink_delivery_zones")
    .delete()
    .eq("id", zoneId)
    .eq("shop_id", shopId);
  if (error) throw error;
}

// ---------------------------------------------------------------------- orders

export interface SellerOrder extends MarketlinkOrder {
  items: MarketlinkOrderItem[];
}

export async function listSellerOrders(shopId: string): Promise<SellerOrder[]> {
  const { data, error } = await supabase
    .from("marketlink_orders")
    .select("*, items:marketlink_order_items(*)")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return asJson<SellerOrder[]>(data ?? []);
}

export async function setOrderStatus(
  orderId: string,
  status: MarketlinkOrder["status"],
): Promise<MarketlinkOrder> {
  const { data, error } = await supabase.rpc("marketlink_set_order_status", {
    p_order_id: orderId,
    p_status: status,
  });
  if (error) throw error;
  return asJson<MarketlinkOrder>(data);
}

export async function saveOwnerNote(orderId: string, note: string) {
  const { error } = await supabase
    .from("marketlink_orders")
    .update({ owner_note: note.trim() || null })
    .eq("id", orderId);
  if (error) throw error;
}

// --------------------------------------------------------------- notifications

export async function listNotifications(shopId: string): Promise<MarketlinkNotification[]> {
  const { data, error } = await supabase
    .from("marketlink_notifications")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function unreadNotificationCount(shopId: string): Promise<number> {
  const { count, error } = await supabase
    .from("marketlink_notifications")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markNotificationsRead(shopId: string) {
  const { error } = await supabase
    .from("marketlink_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("shop_id", shopId)
    .is("read_at", null);
  if (error) throw error;
}

// ------------------------------------------------------------ customer profile

export async function getCustomerProfile(
  userId: string,
): Promise<MarketlinkCustomerProfile | null> {
  const { data, error } = await supabase
    .from("marketlink_customer_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveCustomerProfile(
  userId: string,
  patch: {
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    country?: string | null;
    region?: string | null;
    city?: string | null;
  },
) {
  const { error } = await supabase
    .from("marketlink_customer_profiles")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}

// ---------------------------------------------------------------- public reads

export interface FeedQuery {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  shopSlug?: string;
  country?: string;
  region?: string;
  lat?: number;
  lng?: number;
  sort?: MarketFeedSort;
  limit?: number;
  offset?: number;
}

export async function fetchMarketplaceFeed(query: FeedQuery): Promise<MarketFeedResult> {
  const { data, error } = await supabase.rpc("marketlink_feed", {
    ...(query.search ? { p_search: query.search } : {}),
    ...(query.category ? { p_category: query.category } : {}),
    ...(query.minPrice !== undefined ? { p_min_price: query.minPrice } : {}),
    ...(query.maxPrice !== undefined ? { p_max_price: query.maxPrice } : {}),
    ...(query.inStock !== undefined ? { p_in_stock: query.inStock } : {}),
    ...(query.shopSlug ? { p_shop_slug: query.shopSlug } : {}),
    ...(query.country ? { p_country: query.country } : {}),
    ...(query.region ? { p_region: query.region } : {}),
    ...(query.lat !== undefined ? { p_lat: query.lat } : {}),
    ...(query.lng !== undefined ? { p_lng: query.lng } : {}),
    ...(query.sort ? { p_sort: query.sort } : {}),
    p_limit: query.limit ?? 24,
    p_offset: query.offset ?? 0,
  });
  if (error) throw error;
  const result = asJson<MarketFeedResult | null>(data);
  if (!result) return { items: [], has_more: false, returned: 0 };
  return result;
}

export async function fetchMarketCategories(): Promise<MarketCategory[]> {
  const { data, error } = await supabase.rpc("marketlink_categories");
  if (error) throw error;
  return asJson<MarketCategory[]>(data ?? []);
}

/**
 * Saved products.
 *
 * The toggle is a database function rather than an upsert from the browser, so
 * the public-visibility check and the row's ownership both live in one place the
 * client cannot skip. These calls are authenticated-only; PostgreSQL refuses the
 * anonymous role outright.
 */
export async function fetchFavouriteIds(): Promise<string[]> {
  const { data, error } = await supabase.rpc("marketlink_favourite_ids");
  if (error) throw error;
  return asJson<string[]>(data ?? []);
}

export async function toggleFavourite(listingId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("marketlink_toggle_favourite", {
    p_listing_id: listingId,
  });
  if (error) throw error;
  return data === true;
}

export async function fetchMyFavourites(): Promise<MarketFeedItem[]> {
  const { data, error } = await supabase.rpc("marketlink_my_favourites");
  if (error) throw error;
  return asJson<MarketFeedItem[]>(data ?? []);
}

export async function fetchPublicShop(slug: string): Promise<PublicShopPayload | null> {
  const { data, error } = await supabase.rpc("marketlink_shop", { p_slug: slug });
  if (error) throw error;
  return isMissing(data) ? null : asJson<PublicShopPayload>(data);
}

export async function fetchPublicProduct(
  slug: string,
  listingId: string,
): Promise<PublicProductPayload | null> {
  const { data, error } = await supabase.rpc("marketlink_product", {
    p_slug: slug,
    p_listing_id: listingId,
  });
  if (error) throw error;
  return isMissing(data) ? null : asJson<PublicProductPayload>(data);
}

export async function submitMarketOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
  const { data, error } = await supabase.rpc("marketlink_submit_order", {
    p_slug: input.slug,
    p_client_token: input.clientToken,
    p_customer_name: input.customerName,
    ...(input.customerPhone ? { p_customer_phone: input.customerPhone } : {}),
    ...(input.customerEmail ? { p_customer_email: input.customerEmail } : {}),
    p_preferred_contact: input.preferredContact,
    p_fulfillment: input.fulfillment,
    ...(input.deliveryZoneId ? { p_delivery_zone_id: input.deliveryZoneId } : {}),
    ...(input.destinationCountry ? { p_destination_country: input.destinationCountry } : {}),
    ...(input.destinationRegion ? { p_destination_region: input.destinationRegion } : {}),
    ...(input.destinationCity ? { p_destination_city: input.destinationCity } : {}),
    ...(input.deliveryAddress ? { p_delivery_address: input.deliveryAddress } : {}),
    ...(input.note ? { p_note: input.note } : {}),
    p_items: input.items as unknown as Json,
  });
  if (error) throw error;
  return asJson<SubmitOrderResult>(data);
}

export interface PublicShopSummary {
  slug: string;
  name: string;
  updated_at: string;
}

export async function fetchPublicShops(): Promise<PublicShopSummary[]> {
  const { data, error } = await supabase.rpc("marketlink_public_shops");
  if (error) throw error;
  return asJson<PublicShopSummary[]>(data ?? []);
}

export async function fetchMyOrders(): Promise<CustomerOrder[]> {
  const { data, error } = await supabase.rpc("marketlink_my_orders");
  if (error) throw error;
  return asJson<CustomerOrder[]>(data ?? []);
}

/** Public URL for an uploaded marketplace image (the bucket is public-read). */
export function marketImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from(STORAGE_BUCKETS.marketlink).getPublicUrl(path);
  return data.publicUrl ?? null;
}

// ------------------------------------------------------------------- shop slug

export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50)
    .replace(/^-|-$/g, "");
}

export async function slugIsAvailable(slug: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("marketlink_slug_available", { p_slug: slug });
  if (error) throw error;
  return data === true;
}

export async function changeShopSlug(shopId: string, slug: string): Promise<string> {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(normalized) || normalized.length < 3) {
    throw new Error("Use 3–60 lowercase letters, numbers and single hyphens.");
  }
  const { data, error } = await supabase
    .from("shops")
    .update({ slug: normalized })
    .eq("id", shopId)
    .select("slug")
    .single();
  if (error) throw error;
  return data.slug;
}

export const DELIVERY_KINDS: { value: MarketlinkDeliveryKind; label: string }[] = [
  { value: "local", label: "Local delivery" },
  { value: "nationwide", label: "Nationwide delivery" },
  { value: "worldwide", label: "Worldwide delivery" },
];
