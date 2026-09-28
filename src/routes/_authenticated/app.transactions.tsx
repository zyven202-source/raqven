import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Receipt, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { ReceiptSheet } from "@/components/app/ReceiptSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useRefundedQuantities, useCreateRefund, useTransactions } from "@/hooks/useLedger";
import { useSaleDetail } from "@/hooks/useSales";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  kindLabel,
  type TransactionKind,
  type TransactionRow,
} from "@/services/transactions.service";

export const Route = createFileRoute("/_authenticated/app/transactions")({
  head: () => ({ meta: [{ title: "Sales & transactions — RAVQEN" }] }),
  component: TransactionsPage,
});

const FILTERS: { value: TransactionKind | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sale", label: "Sales" },
  { value: "payment", label: "Payments" },
  { value: "debt_payment", label: "Debt" },
  { value: "expense", label: "Expenses" },
  { value: "refund", label: "Refunds" },
  { value: "stock_in", label: "Stock in" },
  { value: "stock_adjustment", label: "Adjustments" },
];

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

  return (
    <PageContainer>
      <PageHeader
        title="Sales & transactions"
        subtitle="One line per event, newest first. Nothing here is deleted."
      />

      {activeShop?.accepts_refunds ? (
        <p className="mt-2 text-xs text-muted-foreground">
          This shop accepts refunds — open a sale to refund it.
        </p>
      ) : null}

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-3.5 text-xs font-medium",
              filter === option.value
                ? "border-primary bg-primary/5 text-ink"
                : "border-border text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {transactionsQuery.isPending ? (
          <LoadingState label="Loading transactions…" />
        ) : transactionsQuery.isError ? (
          <ErrorState
            message={transactionsQuery.error.message}
            onRetry={() => void transactionsQuery.refetch()}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Complete a sale at the till, record an expense or add stock and it appears here."
            action={
              <Link to="/app/pos" search={{ shop: undefined }}>
                <Button variant="outline">Go to the till</Button>
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  className="surface-panel flex w-full items-start gap-3 p-3 text-left active:bg-secondary"
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                      row.direction === "in"
                        ? "bg-primary/10 text-ink"
                        : row.direction === "out"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {row.direction === "in" ? (
                      <ArrowUpRight className="size-4" />
                    ) : row.direction === "out" ? (
                      <ArrowDownRight className="size-4" />
                    ) : (
                      <Minus className="size-4" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{row.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {kindLabel(row.kind)} · {formatDateTime(row.occurredAt)}
                    </p>
                    {row.reference || row.userName ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {[row.reference, row.userName].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        row.direction === "out" ? "text-destructive" : "text-foreground",
                      )}
                    >
                      {row.direction === "in" ? "+" : row.direction === "out" ? "-" : ""}
                      {formatMoney(row.amount, currency)}
                    </p>
                    {row.quantity !== null ? (
                      <p className="text-[11px] text-muted-foreground">
                        {row.quantity > 0 ? "+" : ""}
                        {row.quantity} {row.unit ?? ""}
                      </p>
                    ) : null}
                    {row.status ? (
                      <p className="text-[11px] capitalize text-muted-foreground">{row.status}</p>
                    ) : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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

/** Detail for a non-sale event, using exactly the fields the row carries. */
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

  async function submitRefund() {
    if (!row || !sale) return;
    const lines = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([saleItemId, quantity]) => ({ saleItemId, quantity, restock: true }));

    if (lines.length === 0) {
      toast.error("Choose the quantity to refund on at least one line.");
      return;
    }

    try {
      const result = await createRefund.mutateAsync({
        saleId: sale.id,
        lines,
        reason: reason || null,
      });
      toast.success(`Refund recorded · ${formatMoney(result.totalAmount, currency)}`, {
        description: "Stock was restored and the refund appears in the ledger.",
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
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto px-4 pb-8 pt-4">
          <SheetHeader className="px-0 pb-3 text-left">
            <SheetTitle className="text-base">
              {row ? kindLabel(row.kind) : "Transaction"}
            </SheetTitle>
          </SheetHeader>

          {row ? (
            <>
              <div className="surface-panel space-y-1.5 p-4 text-sm">
                <Row label="Amount" value={formatMoney(row.amount, currency)} strong />
                <Row label="When" value={formatDateTime(row.occurredAt)} />
                <Row label="Recorded by" value={row.userName ?? "—"} />
                <Row label="Reference" value={row.reference ?? "—"} />
                {row.subtitle ? <Row label="Note" value={row.subtitle} /> : null}
                {row.status ? <Row label="Status" value={row.status} /> : null}
                {row.quantity !== null ? (
                  <Row
                    label="Quantity"
                    value={`${row.quantity > 0 ? "+" : ""}${row.quantity} ${row.unit ?? ""}`}
                  />
                ) : null}
              </div>

              {isSale ? (
                detail.isPending ? (
                  <LoadingState label="Loading the sale…" />
                ) : detail.isError ? (
                  <ErrorState message={detail.error.message} />
                ) : detail.data ? (
                  <div className="mt-4 space-y-3">
                    <div className="surface-panel p-4">
                      <p className="text-sm font-medium">Items</p>
                      <ul className="mt-2 space-y-2">
                        {items.map((item) => {
                          const remaining = refundableQuantity(item.id, Number(item.quantity));
                          const already = refunded.data?.[item.id] ?? 0;
                          return (
                            <li key={item.id} className="text-sm">
                              <div className="flex justify-between gap-2">
                                <span className="min-w-0 truncate">{item.product_name}</span>
                                <span className="shrink-0">
                                  {formatMoney(item.subtotal, currency)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {Number(item.quantity)} × {formatMoney(item.unit_price, currency)}
                                {already > 0 ? ` · ${already} refunded` : ""}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                      <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                        <Row label="Subtotal" value={formatMoney(sale?.subtotal ?? 0, currency)} />
                        {Number(sale?.discount_amount ?? 0) > 0 ? (
                          <Row
                            label="Discount"
                            value={`-${formatMoney(sale?.discount_amount ?? 0, currency)}`}
                          />
                        ) : null}
                        <Row
                          label="Total"
                          value={formatMoney(sale?.total_amount ?? 0, currency)}
                          strong
                        />
                        <Row label="Paid" value={formatMoney(sale?.amount_paid ?? 0, currency)} />
                        {Number(sale?.balance_due ?? 0) > 0 ? (
                          <Row
                            label="Balance owing"
                            value={formatMoney(sale?.balance_due ?? 0, currency)}
                          />
                        ) : null}
                        <Row label="Status" value={sale?.status ?? "—"} />
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      className="h-12 w-full"
                      onClick={() => setReceiptSaleId(row.sourceId)}
                    >
                      <Receipt /> View receipt
                    </Button>

                    {detail.data.refunds.length > 0 ? (
                      <div className="surface-panel p-4">
                        <p className="text-sm font-medium">Refunds on this sale</p>
                        <ul className="mt-2 space-y-1 text-sm">
                          {detail.data.refunds.map((refund) => (
                            <li key={refund.id} className="flex justify-between gap-2">
                              <span className="min-w-0 truncate text-muted-foreground">
                                {refund.reason || "Refund"} · {formatDateTime(refund.created_at)}
                              </span>
                              <span>{formatMoney(refund.total_amount, currency)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {acceptsRefunds ? (
                      <div className="surface-panel p-4">
                        <p className="text-sm font-medium">Refund items</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Restoring the goods puts the quantity back on the shelf and writes a
                          refund movement.
                        </p>
                        <ul className="mt-3 space-y-3">
                          {items.map((item) => {
                            const remaining = refundableQuantity(item.id, Number(item.quantity));
                            if (remaining <= 0) return null;
                            return (
                              <li key={item.id} className="flex items-center justify-between gap-3">
                                <span className="min-w-0 flex-1 truncate text-sm">
                                  {item.product_name}
                                  <span className="block text-xs text-muted-foreground">
                                    up to {remaining} refundable
                                  </span>
                                </span>
                                <Input
                                  type="number"
                                  min={0}
                                  max={remaining}
                                  step="1"
                                  value={quantities[item.id] ?? 0}
                                  onChange={(event) => {
                                    const next = Math.max(
                                      0,
                                      Math.min(remaining, Number(event.target.value) || 0),
                                    );
                                    setQuantities((current) => ({ ...current, [item.id]: next }));
                                  }}
                                  className="h-11 w-20 text-center"
                                />
                              </li>
                            );
                          })}
                        </ul>
                        <div className="mt-3 space-y-1.5">
                          <Label htmlFor="refund-reason">Reason (optional)</Label>
                          <Input
                            id="refund-reason"
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="e.g. Customer changed their mind"
                            className="h-11"
                            autoComplete="off"
                          />
                        </div>
                        <Button
                          className="mt-3 h-12 w-full"
                          variant="outline"
                          disabled={createRefund.isPending}
                          onClick={() => void submitRefund()}
                        >
                          {createRefund.isPending ? "Recording…" : "Record refund"}
                        </Button>
                      </div>
                    ) : (
                      <div className="surface-panel flex items-start gap-2.5 p-4">
                        <TriangleAlert
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                        <p className="text-xs text-muted-foreground">
                          This shop does not accept refunds, so the refund controls are hidden and
                          the database refuses refund operations. The owner can change that in
                          Settings.
                        </p>
                      </div>
                    )}
                  </div>
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

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 truncate text-right", strong && "font-semibold")}>{value}</span>
    </div>
  );
}
