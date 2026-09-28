import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { HandCoins, Phone } from "lucide-react";
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
import { useDebtorDetail, useDebtors, useRecordDebtorPayment } from "@/hooks/useDebtors";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PAYMENT_METHODS } from "@/services/shops.service";
import type { Debtor, PaymentMethod } from "@/types/ravqen";

export const Route = createFileRoute("/_authenticated/app/debtors")({
  head: () => ({ meta: [{ title: "Debtors — RAVQEN" }] }),
  component: DebtorsPage,
});

function DebtorsPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";

  const [includeSettled, setIncludeSettled] = useState(false);
  const [selected, setSelected] = useState<Debtor | null>(null);

  const debtorsQuery = useDebtors(shopId, includeSettled);
  const debtors = debtorsQuery.data ?? [];
  const total = debtors.reduce((sum, debtor) => sum + Number(debtor.total_owed), 0);

  return (
    <PageContainer>
      <PageHeader title="Debtors" subtitle="Credit given, and what is still owed." />

      {debtors.length > 0 ? (
        <div className="gradient-ink mt-4 rounded-2xl p-5">
          <p className="text-xs uppercase tracking-widest text-champagne/70">Outstanding</p>
          <p className="mt-1 font-display text-3xl text-background">
            {formatMoney(total, currency)}
          </p>
          <p className="mt-1 text-xs text-background/70">
            across {debtors.filter((debtor) => Number(debtor.total_owed) > 0).length} debtor
            {debtors.filter((debtor) => Number(debtor.total_owed) > 0).length === 1 ? "" : "s"}
          </p>
        </div>
      ) : null}

      <div className="mt-4">
        <Button
          type="button"
          variant={includeSettled ? "default" : "outline"}
          className="h-10"
          onClick={() => setIncludeSettled((value) => !value)}
        >
          {includeSettled ? "Showing settled debtors" : "Show settled debtors"}
        </Button>
      </div>

      <div className="mt-4">
        {debtorsQuery.isPending ? (
          <LoadingState label="Loading debtors…" />
        ) : debtorsQuery.isError ? (
          <ErrorState
            message={debtorsQuery.error.message}
            onRetry={() => void debtorsQuery.refetch()}
          />
        ) : debtors.length === 0 ? (
          <EmptyState
            title="No debtors"
            description="A debtor appears here the first time you record a credit sale at the till."
          />
        ) : (
          <ul className="space-y-2.5">
            {debtors.map((debtor) => (
              <li key={debtor.id}>
                <button
                  type="button"
                  onClick={() => setSelected(debtor)}
                  className="surface-panel flex w-full items-center gap-3 p-3.5 text-left active:bg-secondary"
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary">
                    <HandCoins className="size-4 text-ink-soft" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{debtor.name}</span>
                    {debtor.phone ? (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="size-3" /> {debtor.phone}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-xs text-muted-foreground">No phone</span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold">
                      {formatMoney(debtor.total_owed, currency)}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {Number(debtor.total_owed) > 0 ? "owed" : "settled"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DebtorSheet
        debtor={selected}
        shopId={shopId}
        currency={currency}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </PageContainer>
  );
}

function DebtorSheet({
  debtor,
  shopId,
  currency,
  onOpenChange,
}: {
  debtor: Debtor | null;
  shopId: string;
  currency: string;
  onOpenChange: (open: boolean) => void;
}) {
  const detail = useDebtorDetail(debtor?.id ?? null);
  const recordPayment = useRecordDebtorPayment(shopId);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");

  const owed = Number(detail.data?.debtor.total_owed ?? debtor?.total_owed ?? 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!debtor) return;

    const value = Number(amount.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter an amount above zero.");
      return;
    }

    try {
      const result = await recordPayment.mutateAsync({
        debtorId: debtor.id,
        amount: value,
        method,
        reference: reference || null,
      });
      toast.success(`Payment recorded · ${formatMoney(value, currency)}`, {
        description:
          result.balanceRemaining > 0
            ? `${formatMoney(result.balanceRemaining, currency)} still owed.`
            : "This debt is now settled.",
      });
      setAmount("");
      setReference("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The payment was refused.", {
        duration: 8000,
      });
    }
  }

  return (
    <Sheet
      open={debtor !== null}
      onOpenChange={(open) => {
        if (!open) {
          setAmount("");
          setReference("");
        }
        onOpenChange(open);
      }}
    >
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto px-4 pb-8 pt-4">
        <SheetHeader className="px-0 pb-3 text-left">
          <SheetTitle className="text-base">{debtor?.name ?? "Debtor"}</SheetTitle>
        </SheetHeader>

        {detail.isPending ? (
          <LoadingState label="Loading the account…" />
        ) : detail.isError ? (
          <ErrorState message={detail.error.message} />
        ) : detail.data ? (
          <div className="space-y-4">
            <div className="surface-panel p-4">
              <p className="text-xs uppercase tracking-widest text-muted-foreground">Still owed</p>
              <p className="mt-1 text-2xl font-semibold">{formatMoney(owed, currency)}</p>
              {detail.data.debtor.phone ? (
                <p className="mt-1 text-xs text-muted-foreground">{detail.data.debtor.phone}</p>
              ) : null}
            </div>

            {owed > 0 ? (
              <form onSubmit={submit} className="surface-panel space-y-3 p-4">
                <p className="text-sm font-medium">Record a payment</p>
                <div className="space-y-1.5">
                  <Label htmlFor="debt-amount">Amount</Label>
                  <Input
                    id="debt-amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder={String(owed)}
                    className="h-12 text-lg"
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="text-xs text-ink-soft underline-offset-4 hover:underline"
                    onClick={() => setAmount(String(owed))}
                  >
                    Pay the full {formatMoney(owed, currency)}
                  </button>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="debt-method">Method</Label>
                  <Select
                    value={method}
                    onValueChange={(value) => setMethod(value as PaymentMethod)}
                  >
                    <SelectTrigger id="debt-method" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.filter((option) => option.value !== "credit").map(
                        (option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="debt-reference">Reference (optional)</Label>
                  <Input
                    id="debt-reference"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="e.g. M-Pesa code"
                    className="h-11"
                    autoComplete="off"
                  />
                </div>
                <Button type="submit" className="h-12 w-full" disabled={recordPayment.isPending}>
                  {recordPayment.isPending ? "Recording…" : "Record payment"}
                </Button>
              </form>
            ) : (
              <p className="surface-panel p-4 text-sm text-muted-foreground">
                This debtor has nothing outstanding.
              </p>
            )}

            <div className="surface-panel p-4">
              <p className="text-sm font-medium">Credit sales</p>
              {detail.data.sales.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">No sales on account yet.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {detail.data.sales.map((sale) => (
                    <li key={sale.id} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate text-muted-foreground">
                        {sale.receipt_number} · {formatDateTime(sale.sold_at)}
                      </span>
                      <span className="shrink-0 text-right">
                        {formatMoney(sale.total_amount, currency)}
                        {Number(sale.balance_due) > 0 ? (
                          <span className="block text-xs text-destructive">
                            {formatMoney(sale.balance_due, currency)} owed
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="surface-panel p-4">
              <p className="text-sm font-medium">Repayments</p>
              {detail.data.payments.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">No repayments recorded yet.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {detail.data.payments.map((payment) => (
                    <li key={payment.id} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate text-muted-foreground">
                        {payment.method} · {formatDateTime(payment.paid_at)}
                      </span>
                      <span className="shrink-0">{formatMoney(payment.amount, currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
