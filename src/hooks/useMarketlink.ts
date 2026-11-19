import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addDeliveryZone,
  changeShopSlug,
  fetchMarketCategories,
  fetchMarketplaceFeed,
  fetchMyOrders,
  fetchPublicShops,
  fetchPublicProduct,
  fetchPublicShop,
  getCustomerProfile,
  getStorefront,
  listDeliveryZones,
  listListings,
  listNotifications,
  listSellerOrders,
  markNotificationsRead,
  publishListing,
  removeDeliveryZone,
  saveCustomerProfile,
  saveStorefront,
  saveOwnerNote,
  setListingPublished,
  setOrderStatus,
  setStorefrontPublished,
  submitMarketOrder,
  unreadNotificationCount,
  type FeedQuery,
  type PublishListingInput,
  type SellerOrder,
} from "@/services/marketlink.service";
import type { MarketlinkStorefrontUpdate } from "@/types/savo";
import type { SubmitOrderInput } from "@/types/marketlink";

/** Every key is shop-scoped, so switching shops can never serve another shop's rows. */
export const marketlinkKeys = {
  storefront: (shopId: string) => ["marketlink", "storefront", shopId] as const,
  listings: (shopId: string) => ["marketlink", "listings", shopId] as const,
  zones: (shopId: string) => ["marketlink", "zones", shopId] as const,
  orders: (shopId: string) => ["marketlink", "orders", shopId] as const,
  notifications: (shopId: string) => ["marketlink", "notifications", shopId] as const,
  unread: (shopId: string) => ["marketlink", "unread", shopId] as const,
  feed: (filters: FeedQuery) => ["marketlink", "feed", filters] as const,
  categories: ["marketlink", "categories"] as const,
  shop: (slug: string) => ["marketlink", "shop", slug] as const,
  product: (slug: string, id: string) => ["marketlink", "product", slug, id] as const,
  myOrders: ["marketlink", "my-orders"] as const,
  profile: (userId: string) => ["marketlink", "profile", userId] as const,
};

/** Orders and notifications arrive while the owner is looking at the screen. */
const LIVE = { refetchInterval: 30_000, refetchOnWindowFocus: true } as const;

// ------------------------------------------------------------------ storefront

export function useStorefront(shopId: string) {
  return useQuery({
    queryKey: marketlinkKeys.storefront(shopId),
    queryFn: () => getStorefront(shopId),
    enabled: Boolean(shopId),
  });
}

export function useSaveStorefront(shopId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: MarketlinkStorefrontUpdate) => saveStorefront(shopId, patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: marketlinkKeys.storefront(shopId) });
    },
  });
}

export function useSetStorefrontPublished(shopId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (published: boolean) => setStorefrontPublished(shopId, published),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: marketlinkKeys.storefront(shopId) });
    },
  });
}

// -------------------------------------------------------------------- listings

export function useMarketlinkListings(shopId: string) {
  return useQuery({
    queryKey: marketlinkKeys.listings(shopId),
    queryFn: () => listListings(shopId),
    enabled: Boolean(shopId),
  });
}

export function usePublishListing(shopId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PublishListingInput) => publishListing(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: marketlinkKeys.listings(shopId) });
      void client.invalidateQueries({ queryKey: marketlinkKeys.storefront(shopId) });
      void client.invalidateQueries({ queryKey: ["marketlink", "feed"] });
    },
  });
}

export function useSetListingPublished(shopId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, published }: { id: string; published: boolean }) =>
      setListingPublished(shopId, id, published),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: marketlinkKeys.listings(shopId) });
      void client.invalidateQueries({ queryKey: ["marketlink", "feed"] });
    },
  });
}

// ----------------------------------------------------------------------- zones

export function useDeliveryZones(shopId: string) {
  return useQuery({
    queryKey: marketlinkKeys.zones(shopId),
    queryFn: () => listDeliveryZones(shopId),
    enabled: Boolean(shopId),
  });
}

export function useAddDeliveryZone(shopId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: addDeliveryZone,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: marketlinkKeys.zones(shopId) });
      void client.invalidateQueries({ queryKey: marketlinkKeys.storefront(shopId) });
    },
  });
}

export function useRemoveDeliveryZone(shopId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (zoneId: string) => removeDeliveryZone(shopId, zoneId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: marketlinkKeys.zones(shopId) });
    },
  });
}

// ---------------------------------------------------------------------- orders

export function useSellerOrders(shopId: string) {
  return useQuery({
    queryKey: marketlinkKeys.orders(shopId),
    queryFn: () => listSellerOrders(shopId),
    enabled: Boolean(shopId),
    ...LIVE,
  });
}

export function useSetOrderStatus(shopId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ order, status }: { order: SellerOrder; status: SellerOrder["status"] }) =>
      setOrderStatus(order.id, status),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: marketlinkKeys.orders(shopId) });
      void client.invalidateQueries({ queryKey: marketlinkKeys.notifications(shopId) });
      void client.invalidateQueries({ queryKey: marketlinkKeys.unread(shopId) });
    },
  });
}

export function useSaveOwnerNote(shopId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, note }: { orderId: string; note: string }) =>
      saveOwnerNote(orderId, note),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: marketlinkKeys.orders(shopId) });
    },
  });
}

// --------------------------------------------------------------- notifications

export function useMarketlinkNotifications(shopId: string, enabled = true) {
  return useQuery({
    queryKey: marketlinkKeys.notifications(shopId),
    queryFn: () => listNotifications(shopId),
    enabled: Boolean(shopId) && enabled,
    ...LIVE,
  });
}

export function useMarketlinkUnread(shopId: string, enabled = true) {
  return useQuery({
    queryKey: marketlinkKeys.unread(shopId),
    queryFn: () => unreadNotificationCount(shopId),
    enabled: Boolean(shopId) && enabled,
    ...LIVE,
  });
}

export function useMarkNotificationsRead(shopId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => markNotificationsRead(shopId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: marketlinkKeys.notifications(shopId) });
      void client.invalidateQueries({ queryKey: marketlinkKeys.unread(shopId) });
    },
  });
}

// ----------------------------------------------------------------- public feed

export function useMarketFeed(filters: Omit<FeedQuery, "offset">) {
  return useInfiniteQuery({
    queryKey: marketlinkKeys.feed(filters),
    queryFn: ({ pageParam }) => fetchMarketplaceFeed({ ...filters, offset: pageParam as number }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.has_more
        ? allPages.reduce((count, page) => count + page.items.length, 0)
        : undefined,
    staleTime: 30_000,
  });
}

export function usePublicShops() {
  return useQuery({
    queryKey: ["marketlink", "public-shops"],
    queryFn: fetchPublicShops,
    staleTime: 5 * 60_000,
  });
}

export function useMarketCategories() {
  return useQuery({
    queryKey: marketlinkKeys.categories,
    queryFn: fetchMarketCategories,
    staleTime: 5 * 60_000,
  });
}

export function usePublicShop(slug: string) {
  return useQuery({
    queryKey: marketlinkKeys.shop(slug),
    queryFn: () => fetchPublicShop(slug),
    enabled: Boolean(slug),
  });
}

export function usePublicProduct(slug: string, listingId: string) {
  return useQuery({
    queryKey: marketlinkKeys.product(slug, listingId),
    queryFn: () => fetchPublicProduct(slug, listingId),
    enabled: Boolean(slug) && Boolean(listingId),
  });
}

export function useSubmitMarketOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitOrderInput) => submitMarketOrder(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: marketlinkKeys.myOrders });
      void client.invalidateQueries({ queryKey: ["marketlink", "feed"] });
    },
  });
}

export function useMyOrders(enabled = true) {
  return useQuery({
    queryKey: marketlinkKeys.myOrders,
    queryFn: fetchMyOrders,
    enabled,
  });
}

// --------------------------------------------------------------------- profile

export function useCustomerProfile(userId: string) {
  return useQuery({
    queryKey: marketlinkKeys.profile(userId),
    queryFn: () => getCustomerProfile(userId),
    enabled: Boolean(userId),
  });
}

export function useSaveCustomerProfile(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof saveCustomerProfile>[1]) =>
      saveCustomerProfile(userId, patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: marketlinkKeys.profile(userId) });
    },
  });
}

// ------------------------------------------------------------------------ slug

export function useChangeShopSlug() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, slug }: { shopId: string; slug: string }) =>
      changeShopSlug(shopId, slug),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["my-shops"] });
      void client.invalidateQueries({ queryKey: ["shops"] });
    },
  });
}
