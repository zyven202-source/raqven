import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createExpense,
  listExpenses,
  updateExpense,
  type CreateExpenseInput,
  type ExpenseCategory,
  type ListExpensesOptions,
} from "@/services/expenses.service";
import type { PaymentMethod } from "@/types/ravqen";

export const expenseKeys = {
  list: (shopId: string, filters: Record<string, unknown>) =>
    ["expenses", shopId, filters] as const,
};

export function useExpenses(options: ListExpensesOptions) {
  return useQuery({
    queryKey: expenseKeys.list(options.shopId, {
      from: options.from ?? "",
      to: options.to ?? "",
      category: options.category ?? "",
    }),
    queryFn: () => listExpenses(options),
    enabled: Boolean(options.shopId),
    placeholderData: (previous) => previous,
  });
}

export function useCreateExpense(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseInput) => createExpense(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expenses", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["transactions", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["report", shopId] });
    },
  });
}

export function useUpdateExpense(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      expenseId,
      patch,
    }: {
      expenseId: string;
      patch: {
        category?: ExpenseCategory;
        description?: string | null;
        amount?: number;
        method?: PaymentMethod;
        spentAt?: string;
      };
    }) => updateExpense(shopId, expenseId, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expenses", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["transactions", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["report", shopId] });
    },
  });
}
