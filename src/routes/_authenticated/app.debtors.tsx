import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Phone } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { Field, MoneyField } from "@/components/app/fields";
import { Money, StatusBadge } from "@/components/app/primitives";
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
import { useDebtorDetail, useDebtors, useRecordDebtorPayment } from "@/hooks/useDebtors";
import { formatDateTime, formatMoney } from "@/lib/format";
import { PAYMENT_METHODS } from "@/services/shops.service";
import { methodLabel } from "@/services/transactions.service";
import type { Debtor, PaymentMethod } from "@/types/ravqen";

export const Route = createFileRoute("/_authenticated/app/debtors")({
  head: () => ({ meta: [{ title: "Debtors — RAVQEN" }] }),
  component: DebtorsPage,
});

/**
 * Debtors are not customers. A person is on this screen because they took
 * goods on credit, and they leave it when the balance reaches zero. There is no
 * "add customer" anywhere in RAVQEN.
 */
function DebtorsPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";

  const [includeSettled, setIncludeSettled] = useState(false);
  const [selected, setSelected] = useState<Debtor | null>(null);

  const debtorsQuery = useDebtors(shopId, includeSettled);
  const debtors = debtorsQuery.data ?? [];
  const owing = debtors.filter((debtor) => Number(debtor.total_owed) > 0);
  const total = owing.reduce((sum, debtor) => sum + Number(debtor.total_owed), 0);

  return (
    <PageContainer>
      <PageHeader
        title="Debtors"
        subtitle="Only people who took goods on credit."
        action={
          <Button
            variant="outline"
            className="h-10"
            aria-pressed={includeSettled}
            onClick={() => setIncludeSettled((value) => !value)}
          >
            {includeSettled ? "Hide settled" : "Show settled"}
          </Button>
        }
      />

      {/*
        A debtor record is personal data about a real person, and this screen is
        the shop&rsquo;s own notice of what it is holding and why. The shop — not
        RAVQEN — is the party that decided to collect it, so this is the shop
        explaining itself to its own customer, not a consent box RAVQEN could
        collect on someone else&rsquo;s behalf.
      */}
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        A name and phone number on this screen is {activeShop?.name ?? "your shop"}&rsquo;s record
        of who owes money. Everyone in the shop can see it, nothing is sent to RAVQEN&rsquo;s
        servers beyond this shop&rsquo;s own database, and it stays until you delete the record.
      </p>

      {owing.length > 0 ? (
        <div className="glass-1 mb-4 rounded-xl p-4 backdrop-blur-2xl backdrop-saturate-150">
          <p className="text-sm text-muted-foreground">Still owed to you</p>
          <p className="tnum mt-0.5 text-[1.75rem] font-semibold leading-none">
            {formatMoney(total, currency)}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            from {owing.length} {owing.length === 1 ? "person" : "people"}
          </p>
        </div>
      ) : null}

      {debtorsQuery.isLoading ? (
        <LoadingState label="Loading debtors…" />
      ) : debtorsQuery.isError ? (
        <ErrorState
          message={debtorsQuery.error.message}
          onRetry={() => void debtorsQuery.refetch()}
        />
      ) : debtors.length === 0 ? (
        <EmptyState
          title="No outstanding debt"
          description="A debtor appears here the first time you record a credit sale at the till."
        />
      ) : (
        <ul className="list-divided">
          {debtors.map((debtor) => {
            const owed = Number(debtor.total_owed);
            return (
              <li key={debtor.id}>
                <button
                  type="button"
                  onClick={() => setSelected(debtor)}
                  className="flex w-full items-center gap-3 py-3 text-left active:opacity-70"
                >
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-sunken text-xs font-semibold uppercase text-muted-foreground"
                    aria-hidden
                  >
                    {debtor.name.slice(0, 2)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{debtor.name}</span>
                    {debtor.phone ? (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="size-3" aria-hidden /> {debtor.phone}
                      </span>
                    ) : (
                      <span className="mt-0.5 block text-xs text-muted-foreground">No phone</span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <Money amount={owed} currency={currency} className="text-sm font-semibold" />
                    <span className="mt-0.5 block">
                      <StatusBadge tone={owed > 0 ? "caution" : "positive"}>
                        {owed > 0 ? "Owed" : "Settled"}
                      </StatusBadge>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

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
  const entered = Number(amount.replace(/[^0-9.]/g, ""));
  const overpay = owed > 0 && Number.isFinite(entered) && entered > owed;
  const canSubmit = entered > 0 && !overpay && !recordPayment.isPending;

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
            : "This debt is settled.",
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
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto px-5 pb-8 pt-5">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">{debtor?.name ?? "Debtor"}</SheetTitle>
        </SheetHeader>

        {detail.isLoading ? (
          <LoadingState label="Loading the account…" />
        ) : detail.isError ? (
          <ErrorState message={detail.error.message} onRetry={() => void detail.refetch()} />
        ) : detail.data ? (
          <div className="mt-4 space-y-5">
            <div className="glass-1 rounded-xl backdrop-blur-2xl backdrop-saturate-150 p-4">
              <p className="text-sm text-muted-foreground">Still owed</p>
              <p
                className={
                  "tnum mt-0.5 text-2xl font-semibold " +
                  (owed > 0 ? "text-caution" : "text-positive")
                }
              >
                {formatMoney(owed, currency)}
              </p>
              {detail.data.debtor.phone ? (
                <p className="mt-1 text-xs text-muted-foreground">{detail.data.debtor.phone}</p>
              ) : null}
            </div>

            {owed > 0 ? (
              <form onSubmit={submit} className="space-y-4 border-t border-border pt-4">
                <p className="text-sm font-medium">Record a repayment</p>

                <MoneyField
                  id="debt-amount"
                  label="Amount received"
                  value={amount}
                  onChange={setAmount}
                  currency={currency}
                  error={overpay ? "That is more than they owe." : null}
                  placeholder={String(owed)}
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 px-0 text-xs"
                  onClick={() => setAmount(String(owed))}
                >
                  Settle the full {formatMoney(owed, currency)}
                </Button>

                <Field label="How was it paid" htmlFor="debt-method">
                  <Select
                    value={method}
                    onValueChange={(value) => setMethod(value as PaymentMethod)}
                  >
                    <SelectTrigger id="debt-method" className="h-12">
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
                </Field>

                <Field
                  label="Reference"
                  hint="Optional. An M-Pesa code or a receipt note."
                  htmlFor="debt-reference"
                >
                  <Input
                    id="debt-reference"
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    placeholder="e.g. QJG8X2K1PL"
                    className="h-11"
                    autoComplete="off"
                  />
                </Field>

                <Button type="submit" className="h-12 w-full" disabled={!canSubmit}>
                  {recordPayment.isPending ? "Recording…" : "Record repayment"}
                </Button>
              </form>
            ) : (
              <p className="border-t border-border pt-4 text-sm text-muted-foreground">
                Nothing is outstanding on this account.
              </p>
            )}

            <section className="border-t border-border pt-4">
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
                      <span className="tnum shrink-0 text-right">
                        {formatMoney(sale.total_amount, currency)}
                        {Number(sale.balance_due) > 0 ? (
                          <span className="block text-xs text-caution">
                            {formatMoney(sale.balance_due, currency)} still owed
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="border-t border-border pt-4">
              <p className="text-sm font-medium">Repayments</p>
              {detail.data.payments.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">None recorded yet.</p>
              ) : (
                <ul className="mt-2 space-y-2 text-sm">
                  {detail.data.payments.map((payment) => (
                    <li key={payment.id} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate text-muted-foreground">
                        {methodLabel(payment.method)} · {formatDateTime(payment.paid_at)}
                      </span>
                      <span className="tnum shrink-0">{formatMoney(payment.amount, currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
