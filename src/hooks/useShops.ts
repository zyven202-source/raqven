import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createShop,
  deleteShop,
  listMyShops,
  redeemAccessCode,
  shopDeletionPreview,
  type CreateShopInput,
} from "@/services/shops.service";

export const shopsQueryKey = ["shops", "mine"] as const;

export function useMyShops() {
  return useQuery({
    queryKey: shopsQueryKey,
    queryFn: listMyShops,
  });
}

export function useCreateShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShopInput) => createShop(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: shopsQueryKey });
    },
  });
}

/**
 * Redeems a staff access code. The database decides which shop is joined, so on
 * success the shop list is refetched and the new membership appears with it.
 */
export function useJoinWithAccessCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => redeemAccessCode(code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: shopsQueryKey });
    },
  });
}

// ---------------------------------------------------------- shop deletion

export const shopDeletionPreviewKey = ["shops", "deletion-preview"] as const;

/**
 * What deleting this shop would destroy.
 *
 * Never cached and never shared between shops. Every number here is a count of
 * rows that are still there, and every one of them changes with the next sale —
 * so a preview held in the cache from ten minutes ago is a preview of a different
 * shop than the one the owner is being asked to confirm.
 *
 * The query only runs once the owner has actually opened the confirmation, which
 * is what passes the `enabled` flag from the component. Nine hundred people
 * scrolling past a danger zone should not each cost fourteen table counts.
 */
export function useShopDeletionPreview(shopId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...shopDeletionPreviewKey, shopId],
    queryFn: () => shopDeletionPreview(shopId),
    enabled: Boolean(shopId) && enabled,
    staleTime: 0,
    gcTime: 0,
  });
}

export function useDeleteShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shopId, confirmShopName }: { shopId: string; confirmShopName: string }) =>
      deleteShop(shopId, confirmShopName),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: shopsQueryKey });
      // Only this shop's preview is now meaningless; the others, if the owner
      // runs another shop, still describe real rows.
      void queryClient.removeQueries({
        queryKey: [...shopDeletionPreviewKey, variables.shopId],
      });
    },
  });
}
