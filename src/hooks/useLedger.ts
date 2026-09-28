import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getShopReport } from "@/services/reports.service";
import {
  createRefund,
  listRefunds,
  refundedQuantities,
  type CreateRefundInput,
} from "@/services/refunds.service";
import { listTransactions, type ListTransactionsOptions } from "@/services/transactions.service";

// ------------------------------------------------------------------ ledger

export function useTransactions(options: ListTransactionsOptions) {
  return useQuery({
    queryKey: ["transactions", options.shopId, { from: options.from ?? "", to: options.to ?? "" }],
    queryFn: () => listTransactions(options),
    enabled: Boolean(options.shopId),
    placeholderData: (previous) => previous,
  });
}

// ----------------------------------------------------------------- refunds

export function useRefunds(shopId: string) {
  return useQuery({
    queryKey: ["refunds", shopId],
    queryFn: () => listRefunds(shopId),
    enabled: Boolean(shopId),
  });
}

export function useRefundedQuantities(saleId: string | null) {
  return useQuery({
    queryKey: ["refunded", saleId ?? "none"],
    queryFn: () => refundedQuantities(saleId as string),
    enabled: Boolean(saleId),
  });
}

export function useCreateRefund(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRefundInput) => createRefund(input),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["refunds", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["refunded", variables.saleId] });
      void queryClient.invalidateQueries({ queryKey: ["sale", variables.saleId] });
      void queryClient.invalidateQueries({ queryKey: ["receipt", variables.saleId] });
      void queryClient.invalidateQueries({ queryKey: ["products", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["sellable", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["movements", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["transactions", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["debtors", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["report", shopId] });
    },
  });
}

// ----------------------------------------------------------------- reports

export function useShopReport(shopId: string, from: Date, to: Date, enabled: boolean) {
  return useQuery({
    queryKey: ["report", shopId, from.toISOString(), to.toISOString()],
    queryFn: () => getShopReport(shopId, from, to),
    enabled: enabled && Boolean(shopId),
    // Owners only; an employee gets a permission error from the database and
    // there is no point retrying it.
    retry: false,
  });
}
