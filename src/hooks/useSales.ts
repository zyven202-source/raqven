import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createSale,
  getReceiptPayload,
  getSaleDetail,
  listSales,
  listSellableProducts,
  type CreateSaleInput,
  type ListSalesOptions,
} from "@/services/sales.service";

export const salesKeys = {
  sellable: (shopId: string) => ["sellable", shopId] as const,
  list: (shopId: string, filters: Record<string, unknown>) => ["sales", shopId, filters] as const,
  detail: (saleId: string) => ["sale", saleId] as const,
  receipt: (saleId: string) => ["receipt", saleId] as const,
};

export function useSellableProducts(shopId: string) {
  return useQuery({
    queryKey: salesKeys.sellable(shopId),
    queryFn: () => listSellableProducts(shopId),
    enabled: Boolean(shopId),
    // The till must not show a stale price or a stale stock count.
    staleTime: 0,
  });
}

export function useSales(options: ListSalesOptions) {
  return useQuery({
    queryKey: salesKeys.list(options.shopId, {
      search: options.search ?? "",
      from: options.from ?? "",
      to: options.to ?? "",
    }),
    queryFn: () => listSales(options),
    enabled: Boolean(options.shopId),
    placeholderData: (previous) => previous,
  });
}

export function useSaleDetail(saleId: string | null) {
  return useQuery({
    queryKey: salesKeys.detail(saleId ?? "none"),
    queryFn: () => getSaleDetail(saleId as string),
    enabled: Boolean(saleId),
  });
}

export function useReceiptPayload(saleId: string | null) {
  return useQuery({
    queryKey: salesKeys.receipt(saleId ?? "none"),
    queryFn: () => getReceiptPayload(saleId as string),
    enabled: Boolean(saleId),
    /*
      The sale itself is already recorded by the time this runs — it is a
      separate read of stored rows. One quick retry absorbs a single dropped
      packet, but the default of three silent retries with backoff keeps the
      sheet on "Preparing the receipt…" for the better part of ten seconds
      before the error ever lands, which is exactly the endless-spinner state
      this screen must not have. One retry, then an honest error with a button.
    */
    retry: 1,
    retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 4_000),
  });
}

/**
 * Completing a sale touches stock, the ledger, debtors and the report, so every
 * one of those caches is dropped once the database confirms the sale. The
 * mutation does not resolve until the RPC returns — the UI cannot show a
 * receipt for a sale that failed.
 */
export function useCreateSale(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSaleInput) => createSale(input),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["sellable", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["products", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["movements", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["transactions", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["sales", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["debtors", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["report", shopId] });
      void queryClient.invalidateQueries({ queryKey: salesKeys.receipt(result.saleId) });
    },
  });
}
