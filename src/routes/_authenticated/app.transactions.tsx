import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { Receipt, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoticeState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { Field } from "@/components/app/fields";
import { Money, MetricCard } from "@/components/app/primitives";
import { ReceiptSheet } from "@/components/app/ReceiptSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useRefundedQuantities, useCreateRefund, useTransactions } from "@/hooks/useLedger";
import { useSaleDetail } from "@/hooks/useSales";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  kindLabel,
  type TransactionKind,
  type TransactionRow,
} from "@/services/transactions.service";

export const Route = createFileRoute("/_authenticated/app/transactions")({
  head: () => ({ meta: [{ title: "SAVO — Sales & transactions" }] }),
  component: TransactionsPage,
});

/** Same calendar day in the viewer's own timezone. */
function onSameDay(a: TransactionRow, b: TransactionRow) {
  return new Date(a.occurredAt).toDateString() === new Date(b.occurredAt).toDateString();
}

const FILTERS: { value: TransactionKind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sale", label: "Sales" },
  { value: "debt_payment", label: "Debt" },
  { value: "expense", label: "Expenses" },
  { value: "refund", label: "Refunds" },
  { value: "stock_in", label: "Stock in" },
  { value: "stock_adjustment", label: "Counts" },
];

/**
 * The shop's history. One line per event, newest first, each one openable for
 * the full detail. Financial records are never deleted from here — a mistake is
 * corrected by a counter-entry the owner can see.
 */
function TransactionsPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";

  const [filter, setFilter] = useState<TransactionKind | "all">("all");
  const [selected, setSelected] = useState<TransactionRow | null>(null);

  const transactionsQuery = useTransactions({
    shopId,
    limit: 80,
    kinds: filter === "all" ? undefined : [filter],
  });

  const rows = transactionsQuery.data ?? [];

  // Totals of the list on screen. "In this view" is stated in the hint because
  // the list is capped at 80 events — this is not the shop's all-time balance.
  const moneyIn = rows
    .filter((row) => row.direction === "in")
    .reduce((sum, row) => sum + row.amount, 0);
  const moneyOut = rows
    .filter((row) => row.direction === "out")
    .reduce((sum, row) => sum + row.amount, 0);
  const net = moneyIn - moneyOut;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Money"
        title="Sales & transactions"
        subtitle="Everything that has moved, newest first."
      />

      {rows.length > 0 ? (
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MetricCard
            label="In"
            value={formatMoney(moneyIn, currency)}
            hint="In this view"
            tone="positive"
          />
          <MetricCard label="Out" value={formatMoney(moneyOut, currency)} hint="In this view" />
          <MetricCard
            label="Net"
            value={formatMoney(net, currency)}
            hint="In this view"
            tone={net < 0 ? "negative" : "default"}
            className="col-span-2 sm:col-span-1"
          />
        </div>
      ) : null}

      <div className="-mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            aria-pressed={filter === option.value}
            className={cn(
              "press h-10 shrink-0 rounded-full border px-3.5 text-xs font-medium",
              filter === option.value
                ? "border-ink bg-ink text-background"
                : "border-border text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {transactionsQuery.isLoading ? (
        <LoadingState label="Loading transactions…" />
      ) : transactionsQuery.isError ? (
        <ErrorState
          message={transactionsQuery.error.message}
          onRetry={() => void transactionsQuery.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "No transactions yet" : "Nothing of that kind yet"}
          description={
            filter === "all"
              ? "Completed sales, expenses and stock deliveries will appear here."
              : "Try another filter to see the rest of your history."
          }
          action={
            filter === "all" ? (
              <Button asChild variant="outline">
                <Link to="/app/pos" search={{ shop: undefined }}>
                  Go to the till
                </Link>
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setFilter("all")}>
                Show everything
              </Button>
            )
          }
        />
      ) : (
        <ul className="list-divided">
          {rows.map((row, index) => {
            const previous = rows[index - 1];
            const startsDay = !previous || !onSameDay(previous, row);
            // The day's net is the sum of the rows on screen for that day.
            const dayNet = rows
              .filter((entry) => onSameDay(entry, row))
              .reduce(
                (sum, entry) => sum + (entry.direction === "out" ? -entry.amount : entry.amount),
                0,
              );

            return (
              <Fragment key={row.id}>
                {startsDay ? (
                  <li className="flex items-baseline justify-between gap-3 pb-1.5 pt-4 first:pt-0">
                    <h2 className="eyebrow">{formatDate(row.occurredAt)}</h2>
                    <span
                      className={cn(
                        "tnum text-xs font-semibold",
                        dayNet < 0 ? "text-negative" : "text-muted-foreground",
                      )}
                    >
                      {formatMoney(dayNet, currency)}
                    </span>
                  </li>
                ) : null}
                <li>
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="flex w-full items-start gap-3 py-3 text-left active:opacity-70"
                  >
                    <span
                      className={cn(
                        "mt-0.5 shrink-0 text-xs font-semibold uppercase tracking-wide",
                        row.direction === "in"
                          ? "text-positive"
                          : row.direction === "out"
                            ? "text-negative"
                            : "text-muted-foreground",
                      )}
                      aria-hidden
                    >
                      {row.direction === "in" ? "+" : row.direction === "out" ? "−" : "•"}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{row.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {kindLabel(row.kind)}
                        {row.subtitle ? ` · ${row.subtitle}` : ""} ·{" "}
                        {formatDateTime(row.occurredAt)}
                      </span>
                      {row.reference ? (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {row.reference}
                          {row.userName ? ` · ${row.userName}` : ""}
                        </span>
                      ) : row.userName ? (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {row.userName}
                        </span>
                      ) : null}
                    </span>

                    <span className="shrink-0 text-right">
                      <Money
                        amount={row.direction === "out" ? -row.amount : row.amount}
                        currency={currency}
                        className={cn(
                          "text-sm font-semibold",
                          row.direction === "out" ? "text-negative" : "",
                        )}
                      />
                      {row.quantity !== null ? (
                        <span className="tnum block text-[11px] text-muted-foreground">
                          {row.quantity > 0 ? "+" : ""}
                          {row.quantity} {row.unit ?? ""}
                        </span>
                      ) : null}
                      {row.status ? (
                        <span className="block text-[11px] capitalize text-muted-foreground">
                          {row.status}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}

      <TransactionDetailSheet
        row={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        currency={currency}
        acceptsRefunds={Boolean(activeShop?.accepts_refunds)}
        shopId={shopId}
      />
    </PageContainer>
  );
}

/** Detail for any event, using exactly the fields the row carries. */
function TransactionDetailSheet({
  row,
  onOpenChange,
  currency,
  acceptsRefunds,
  shopId,
}: {
  row: TransactionRow | null;
  onOpenChange: (open: boolean) => void;
  currency: string;
  acceptsRefunds: boolean;
  shopId: string;
}) {
  const [receiptSaleId, setReceiptSaleId] = useState<string | null>(null);

  const isSale = row?.kind === "sale";
  const detail = useSaleDetail(isSale ? (row?.sourceId ?? null) : null);
  const refunded = useRefundedQuantities(isSale ? (row?.sourceId ?? null) : null);
  const createRefund = useCreateRefund(shopId);

  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const sale = detail.data?.sale;
  const items = detail.data?.items ?? [];

  function refundableQuantity(saleItemId: string, sold: number) {
    return Math.max(sold - (refunded.data?.[saleItemId] ?? 0), 0);
  }

  const totalRefund = Object.values(quantities).reduce((sum, value) => sum + value, 0);

  async function submitRefund() {
    if (!row || !sale) return;
    const lines = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([saleItemId, quantity]) => ({ saleItemId, quantity, restock: true }));

    if (lines.length === 0) {
      toast.error("Set how many of each item you are taking back.");
      return;
    }

    try {
      const result = await createRefund.mutateAsync({
        saleId: sale.id,
        lines,
        reason: reason || null,
      });
      toast.success(`Refund recorded · ${formatMoney(result.totalAmount, currency)}`, {
        description: "The goods went back on the shelf and the refund is in your history.",
      });
      setQuantities({});
      setReason("");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The refund was refused.", {
        duration: 8000,
      });
    }
  }

  return (
    <>
      <Sheet
        open={row !== null}
        onOpenChange={(open) => {
          if (!open) {
            setQuantities({});
            setReason("");
          }
          onOpenChange(open);
        }}
      >
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto px-5 pb-8 pt-5">
          <SheetHeader className="text-left">
            <SheetTitle className="text-base">
              {row ? kindLabel(row.kind) : "Transaction"}
            </SheetTitle>
          </SheetHeader>

          {row ? (
            <>
              <div className="mt-3 flex items-baseline justify-between gap-3 border-b border-border pb-3">
                <span className="text-sm text-muted-foreground">Amount</span>
                <Money
                  amount={row.direction === "out" ? -row.amount : row.amount}
                  currency={currency}
                  className="text-xl font-semibold"
                />
              </div>

              <dl className="space-y-1.5 py-3 text-sm">
                <Detail label="When" value={formatDateTime(row.occurredAt)} />
                <Detail label="Recorded by" value={row.userName ?? "Unknown"} />
                <Detail label="Reference" value={row.reference ?? "—"} />
                {row.subtitle ? <Detail label="Note" value={row.subtitle} /> : null}
                {row.quantity !== null ? (
                  <Detail
                    label="Quantity"
                    value={`${row.quantity > 0 ? "+" : ""}${row.quantity} ${row.unit ?? ""}`}
                  />
                ) : null}
                {row.status ? <Detail label="Status" value={row.status} /> : null}
              </dl>

              {isSale ? (
                detail.isLoading ? (
                  <LoadingState label="Loading the sale…" />
                ) : detail.isError ? (
                  <ErrorState
                    message={detail.error.message}
                    onRetry={() => void detail.refetch()}
                  />
                ) : detail.data ? (
                  <>
                    <div className="border-t border-border pt-3">
                      <p className="text-sm font-medium">What was sold</p>
                      <ul className="mt-2 space-y-2">
                        {items.map((item) => {
                          const already = refunded.data?.[item.id] ?? 0;
                          return (
                            <li
                              key={item.id}
                              className="flex items-start justify-between gap-3 text-sm"
                            >
                              <span className="min-w-0">
                                <span className="block truncate">{item.product_name}</span>
                                <span className="tnum block text-xs text-muted-foreground">
                                  {Number(item.quantity)} × {formatMoney(item.unit_price, currency)}
                                  {already > 0 ? ` · ${already} refunded` : ""}
                                </span>
                              </span>
                              <span className="tnum shrink-0">
                                {formatMoney(item.subtotal, currency)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>

                      <dl className="mt-3 space-y-1 border-t border-border pt-2 text-sm">
                        <Detail
                          label="Subtotal"
                          value={formatMoney(sale?.subtotal ?? 0, currency)}
                        />
                        {Number(sale?.discount_amount ?? 0) > 0 ? (
                          <Detail
                            label="Discount"
                            value={`− ${formatMoney(sale?.discount_amount ?? 0, currency)}`}
                          />
                        ) : null}
                        <Detail
                          label="Total"
                          value={formatMoney(sale?.total_amount ?? 0, currency)}
                          strong
                        />
                        <Detail
                          label="Paid"
                          value={formatMoney(sale?.amount_paid ?? 0, currency)}
                        />
                        {Number(sale?.balance_due ?? 0) > 0 ? (
                          <Detail
                            label="Still owing"
                            value={formatMoney(sale?.balance_due ?? 0, currency)}
                            strong
                          />
                        ) : null}
                        <Detail label="Status" value={sale?.status ?? "—"} />
                      </dl>
                    </div>

                    <Button
                      variant="outline"
                      className="mt-4 h-12 w-full"
                      onClick={() => setReceiptSaleId(row.sourceId)}
                    >
                      <Receipt className="size-4" /> View receipt
                    </Button>

                    {detail.data.refunds.length > 0 ? (
                      <div className="mt-4 border-t border-border pt-3">
                        <p className="text-sm font-medium">Refunds on this sale</p>
                        <ul className="mt-2 space-y-1.5 text-sm">
                          {detail.data.refunds.map((refund) => (
                            <li key={refund.id} className="flex justify-between gap-3">
                              <span className="min-w-0 truncate text-muted-foreground">
                                {refund.reason || "Refund"} · {formatDateTime(refund.created_at)}
                              </span>
                              <span className="tnum shrink-0">
                                {formatMoney(refund.total_amount, currency)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {acceptsRefunds ? (
                      <div className="mt-4 border-t border-border pt-3">
                        <p className="text-sm font-medium">Take goods back</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Enter how many of each you are returning. They go back on the shelf and
                          the refund is recorded against this sale.
                        </p>

                        <ul className="mt-3 space-y-2">
                          {items.map((item) => {
                            const remaining = refundableQuantity(item.id, Number(item.quantity));
                            if (remaining <= 0) return null;
                            return (
                              <li key={item.id} className="flex items-center justify-between gap-3">
                                <span className="min-w-0 flex-1 truncate text-sm">
                                  {item.product_name}
                                  <span className="block text-xs text-muted-foreground">
                                    up to {remaining}
                                  </span>
                                </span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={remaining}
                                  step="1"
                                  aria-label={`How many ${item.product_name} to refund`}
                                  value={quantities[item.id] ?? 0}
                                  onChange={(event) => {
                                    const next = Math.max(
                                      0,
                                      Math.min(remaining, Number(event.target.value) || 0),
                                    );
                                    setQuantities((current) => ({ ...current, [item.id]: next }));
                                  }}
                                  className="tnum h-11 w-20 text-center"
                                />
                              </li>
                            );
                          })}
                        </ul>

                        <div className="mt-3">
                          <Field
                            label="Reason"
                            hint="Optional, but it helps later."
                            htmlFor="refund-reason"
                          >
                            <Input
                              id="refund-reason"
                              value={reason}
                              onChange={(event) => setReason(event.target.value)}
                              placeholder="e.g. Customer changed their mind"
                              className="h-11"
                              autoComplete="off"
                            />
                          </Field>
                        </div>

                        <Button
                          className="mt-3 h-12 w-full"
                          disabled={createRefund.isPending || totalRefund === 0}
                          onClick={() => void submitRefund()}
                        >
                          {createRefund.isPending
                            ? "Recording…"
                            : `Record refund · ${formatMoney(
                                items.reduce(
                                  (sum, item) =>
                                    sum + (quantities[item.id] ?? 0) * Number(item.unit_price),
                                  0,
                                ),
                                currency,
                              )}`}
                        </Button>
                      </div>
                    ) : (
                      <div className="mt-4">
                        <NoticeState
                          icon={<TriangleAlert className="size-4" aria-hidden />}
                          title="This shop does not take refunds"
                          description="Ask the owner to turn refunds on in Settings if you need to return goods."
                        />
                      </div>
                    )}
                  </>
                ) : null
              ) : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <ReceiptSheet
        saleId={receiptSaleId}
        open={receiptSaleId !== null}
        onOpenChange={(open) => {
          if (!open) setReceiptSaleId(null);
        }}
      />
    </>
  );
}

function Detail({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 truncate text-right", strong && "font-semibold")}>{value}</dd>
    </div>
  );
}
