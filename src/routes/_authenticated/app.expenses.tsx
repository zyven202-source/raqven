import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { Field, MoneyField } from "@/components/app/fields";
import { Money } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/**
 * Money the shop spent. Recorded against the person who recorded it, so the
 * day's result on the Today screen is explainable line by line.
 */
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
        action={
          <Button className="h-10" onClick={() => setOpen(true)}>
            <Plus className="size-4" /> Add
          </Button>
        }
      />

      {expenses.length > 0 ? (
        <div className="glass-1 mb-4 rounded-xl p-4 backdrop-blur-2xl backdrop-saturate-150">
          <p className="text-sm text-muted-foreground">
            {category === "all" ? "Total shown" : expenseCategoryLabel(category)}
          </p>
          <p className="tnum mt-0.5 text-[1.75rem] font-semibold leading-none text-negative">
            {formatMoney(total, currency)}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {expenses.length} {expenses.length === 1 ? "entry" : "entries"}
          </p>
        </div>
      ) : null}

      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
        {[{ value: "all" as const, label: "All" }, ...EXPENSE_CATEGORIES].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setCategory(option.value)}
            aria-pressed={category === option.value}
            className={cn(
              "press h-9 shrink-0 rounded-full border px-3.5 text-xs font-medium",
              category === option.value
                ? "border-ink bg-ink text-background"
                : "border-border text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {expensesQuery.isLoading ? (
        <LoadingState label="Loading expenses…" />
      ) : expensesQuery.isError ? (
        <ErrorState
          message={expensesQuery.error.message}
          onRetry={() => void expensesQuery.refetch()}
        />
      ) : expenses.length === 0 ? (
        <EmptyState
          title={category === "all" ? "No expenses recorded" : "Nothing in this category"}
          description={
            category === "all"
              ? "Lunch, transport, rent, packaging — record them here and they show up in your history."
              : "Try another category, or record a new expense here."
          }
          action={
            <Button onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Record an expense
            </Button>
          }
        />
      ) : (
        <ul className="list-divided">
          {expenses.map((expense) => (
            <li key={expense.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {expense.description || expenseCategoryLabel(expense.category)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {expenseCategoryLabel(expense.category)} · {formatDateTime(expense.spent_at)}
                </p>
              </div>
              <Money
                amount={-Number(expense.amount)}
                currency={currency}
                className="shrink-0 text-sm font-semibold text-negative"
              />
            </li>
          ))}
        </ul>
      )}

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
  const [error, setError] = useState<string | undefined>(undefined);

  const value = Number(amount.replace(/[^0-9.]/g, ""));
  const valid = Number.isFinite(value) && value > 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) {
      setError("Enter an amount above zero.");
      return;
    }
    setError(undefined);

    try {
      await createExpense.mutateAsync({
        shopId,
        category,
        description: description || null,
        amount: value,
        method,
      });
      toast.success("Expense recorded", {
        description: `${formatMoney(value, currency)} · ${expenseCategoryLabel(category)}`,
      });
      setAmount("");
      setDescription("");
      onSaved();
      onOpenChange(false);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The expense could not be saved.";
      setError(message);
      toast.error(message, { duration: 8000 });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="px-5 pb-8 pt-5">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">Record an expense</SheetTitle>
        </SheetHeader>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <MoneyField
            id="expense-amount"
            label="How much?"
            value={amount}
            onChange={(next) => {
              setAmount(next);
              setError(undefined);
            }}
            currency={currency}
            error={error}
            autoFocus
          />

          <Field label="What was it for?" htmlFor="expense-category">
            <Select value={category} onValueChange={(next) => setCategory(next as ExpenseCategory)}>
              <SelectTrigger id="expense-category" className="h-12">
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
          </Field>

          <Field
            label="Note"
            hint="Optional — where it went or what it was for."
            htmlFor="expense-description"
          >
            <Input
              id="expense-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="e.g. Matatu fare to Gikomba"
              className="h-12"
              autoComplete="off"
            />
          </Field>

          <Field label="Paid with" htmlFor="expense-method">
            <Select value={method} onValueChange={(next) => setMethod(next as PaymentMethod)}>
              <SelectTrigger id="expense-method" className="h-12">
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
          </Field>

          <Button
            type="submit"
            className="h-12 w-full"
            disabled={createExpense.isPending || !valid}
          >
            {createExpense.isPending ? "Saving…" : "Save expense"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
