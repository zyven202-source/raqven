import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createShop,
  listMyShops,
  redeemAccessCode,
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
