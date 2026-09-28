import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getDebtorDetail,
  listDebtors,
  recordDebtorPayment,
  totalOutstanding,
  updateDebtor,
  type RecordDebtorPaymentInput,
} from "@/services/debtors.service";

export const debtorKeys = {
  list: (shopId: string, includeSettled: boolean) => ["debtors", shopId, includeSettled] as const,
  detail: (debtorId: string) => ["debtor", debtorId] as const,
  total: (shopId: string) => ["debtors", shopId, "total"] as const,
};

export function useDebtors(shopId: string, includeSettled = false) {
  return useQuery({
    queryKey: debtorKeys.list(shopId, includeSettled),
    queryFn: () => listDebtors(shopId, includeSettled),
    enabled: Boolean(shopId),
    placeholderData: (previous) => previous,
  });
}

export function useOutstandingTotal(shopId: string) {
  return useQuery({
    queryKey: debtorKeys.total(shopId),
    queryFn: () => totalOutstanding(shopId),
    enabled: Boolean(shopId),
  });
}

export function useDebtorDetail(debtorId: string | null) {
  return useQuery({
    queryKey: debtorKeys.detail(debtorId ?? "none"),
    queryFn: () => getDebtorDetail(debtorId as string),
    enabled: Boolean(debtorId),
  });
}

export function useRecordDebtorPayment(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordDebtorPaymentInput) => recordDebtorPayment(input),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["debtors", shopId] });
      void queryClient.invalidateQueries({ queryKey: debtorKeys.detail(variables.debtorId) });
      void queryClient.invalidateQueries({ queryKey: ["transactions", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["sales", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["report", shopId] });
    },
  });
}

export function useUpdateDebtor(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      debtorId,
      patch,
    }: {
      debtorId: string;
      patch: {
        name?: string;
        phone?: string | null;
        creditLimit?: number | null;
        notes?: string | null;
      };
    }) => updateDebtor(debtorId, patch),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["debtors", shopId] });
      void queryClient.invalidateQueries({ queryKey: debtorKeys.detail(variables.debtorId) });
    },
  });
}
