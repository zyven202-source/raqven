import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createShop, listMyShops, type CreateShopInput } from "@/services/shops.service";

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
