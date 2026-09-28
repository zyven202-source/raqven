import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  listMovements,
  recordDamage,
  recordStockCount,
  recordStockIn,
  type ListMovementsOptions,
} from "@/services/inventory.service";

export const inventoryKeys = {
  movements: (shopId: string, productId?: string) =>
    ["movements", shopId, productId ?? "all"] as const,
};

/** A stock write changes products, the ledger, and the owner's report. */
function useStockInvalidation(shopId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["products", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["movements", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["transactions", shopId] });
    void queryClient.invalidateQueries({ queryKey: ["report", shopId] });
  };
}

export function useMovements(options: ListMovementsOptions) {
  return useQuery({
    queryKey: inventoryKeys.movements(options.shopId, options.productId),
    queryFn: () => listMovements(options),
    enabled: Boolean(options.shopId),
  });
}

export function useRecordStockIn(shopId: string) {
  const invalidate = useStockInvalidation(shopId);
  return useMutation({ mutationFn: recordStockIn, onSuccess: invalidate });
}

export function useRecordStockCount(shopId: string) {
  const invalidate = useStockInvalidation(shopId);
  return useMutation({
    mutationFn: ({
      productId,
      countedQuantity,
      notes,
    }: {
      productId: string;
      countedQuantity: number;
      notes?: string | null;
    }) => recordStockCount(productId, countedQuantity, notes),
    onSuccess: invalidate,
  });
}

export function useRecordDamage(shopId: string) {
  const invalidate = useStockInvalidation(shopId);
  return useMutation({
    mutationFn: ({
      productId,
      quantity,
      notes,
    }: {
      productId: string;
      quantity: number;
      notes?: string | null;
    }) => recordDamage(productId, quantity, notes),
    onSuccess: invalidate,
  });
}
