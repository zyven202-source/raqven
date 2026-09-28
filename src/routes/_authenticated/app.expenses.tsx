import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useCreateExpense, useExpenses } from "@/hooks/useExpenses";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  EXPENSE_CATEGORIES,
  expenseCategoryLabel,
  type ExpenseCategory,
} from "@/services/expenses.service";
import { PAYMENT_METHODS } from "@/services/shops.service";
import type { PaymentMethod } from "@/types/ravqen";

export const Route = createFileRoute("/_authenticated/app/expenses")({
  head: () => ({ meta: [{ title: "Expenses — RAVQEN" }] }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";

  const [category, setCategory] = useState<ExpenseCategory | "all">("all");
  const [open, setOpen] = useState(false);

  const expensesQuery = useExpenses({
    shopId,
    limit: 120,
    category: category === "all" ? undefined : category,
  });

  const expenses = expensesQuery.data ?? [];
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  return (
    <PageContainer>
      <PageHeader
        title="Expenses"
        subtitle="What left the till or the account, recorded where it happened."
        action={
          <Button className="h-11" onClick={() => setOpen(true)}>
            <Plus /> Add
          </Button>
        }
      />

      {expenses.length > 0 ? (
        <div className="surface-panel mt-4 flex items-center gap-3 p-4">
          <span className="grid size-10 place-items-center rounded-xl bg-secondary">
            <Wallet className="size-4 text-ink-soft" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              {category === "all" ? "Shown total" : expenseCategoryLabel(category)}
            </p>
            <p className="text-xl font-semibold">{formatMoney(total, currency)}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setCategory("all")}
          className={cn(
            "h-9 shrink-0 rounded-full border px-3.5 text-xs font-medium",
            category === "all"
              ? "border-primary bg-primary/5 text-ink"
              : "border-border text-muted-foreground",
          )}
        >
          All
        </button>
        {EXPENSE_CATEGORIES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setCategory(option.value)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-3.5 text-xs font-medium",
              category === option.value
                ? "border-primary bg-primary/5 text-ink"
                : "border-border text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {expensesQuery.isPending ? (
          <LoadingState label="Loading expenses…" />
        ) : expensesQuery.isError ? (
          <ErrorState
            message={expensesQuery.error.message}
            onRetry={() => void expensesQuery.refetch()}
          />
        ) : expenses.length === 0 ? (
          <EmptyState
            title="No expenses recorded"
            description="Lunch, transport, rent, packaging — record them here and they appear in the ledger."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus /> Record an expense
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {expenses.map((expense) => (
              <li key={expense.id} className="surface-panel flex items-start gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {expense.description || expenseCategoryLabel(expense.category)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {expenseCategoryLabel(expense.category)} · {formatDateTime(expense.spent_at)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-destructive">
                  -{formatMoney(expense.amount, currency)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AddExpenseSheet
        shopId={shopId}
        currency={currency}
        open={open}
        onOpenChange={setOpen}
        onSaved={() => setCategory("all")}
      />
    </PageContainer>
  );
}

function AddExpenseSheet({
  shopId,
  currency,
  open,
  onOpenChange,
  onSaved,
}: {
  shopId: string;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const createExpense = useCreateExpense(shopId);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("lunch");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = Number(amount.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter an amount above zero.");
      return;
    }

    try {
      await createExpense.mutateAsync({
        shopId,
        category,
        description: description || null,
        amount: value,
        method,
      });
      toast.success(`Expense recorded · ${formatMoney(value, currency)}`);
      setAmount("");
      setDescription("");
      onSaved();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The expense could not be saved.", {
        duration: 8000,
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="px-4 pb-8 pt-4">
        <SheetHeader className="px-0 pb-3 text-left">
          <SheetTitle className="text-base">Record an expense</SheetTitle>
        </SheetHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="expense-amount">Amount</Label>
            <Input
              id="expense-amount"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="h-12 text-lg"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-category">Category</Label>
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as ExpenseCategory)}
            >
              <SelectTrigger id="expense-category" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-description">Description (optional)</Label>
            <Input
              id="expense-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Matatu to Gikomba"
              className="h-11"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-method">Paid with</Label>
            <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
              <SelectTrigger id="expense-method" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.filter((option) => option.value !== "credit").map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" className="h-12 w-full" disabled={createExpense.isPending}>
            {createExpense.isPending ? "Saving…" : "Save expense"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
