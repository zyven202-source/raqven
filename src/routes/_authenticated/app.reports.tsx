import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { ErrorState, LoadingState, PageContainer, PageHeader } from "@/components/app/AppChrome";
import { OwnerOnly } from "@/components/app/OwnerOnly";
import { cn } from "@/lib/utils";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useShopReport } from "@/hooks/useLedger";
import { formatMoney } from "@/lib/format";
import { startOfDay, startOfMonth } from "@/services/reports.service";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({ meta: [{ title: "Reports — RAVQEN" }] }),
  component: () => (
    <OwnerOnly title="Reports">
      <ReportsPage />
    </OwnerOnly>
  ),
});

type Range = "today" | "month" | "year";

const RANGES: { value: Range; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
];

function rangeBounds(range: Range): { from: Date; to: Date } {
  const now = new Date();
  if (range === "today") return { from: startOfDay(now), to: now };
  if (range === "month") return { from: startOfMonth(now), to: now };
  const from = new Date(now.getFullYear(), 0, 1);
  return { from, to: now };
}

function ReportsPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";
  const [range, setRange] = useState<Range>("today");

  const bounds = rangeBounds(range);
  const reportQuery = useShopReport(shopId, bounds.from, bounds.to, Boolean(shopId));

  if (reportQuery.isPending) return <LoadingState label="Working out the numbers…" />;
  if (reportQuery.isError) {
    return (
      <PageContainer>
        <PageHeader title="Reports" />
        <div className="mt-6">
          <ErrorState
            message={reportQuery.error.message}
            onRetry={() => void reportQuery.refetch()}
          />
        </div>
      </PageContainer>
    );
  }

  const report = reportQuery.data;
  const margin = report.grossSales - report.costOfGoods;
  const netCash = report.collected + report.debtCollected - report.expenses - report.refunds;

  return (
    <PageContainer>
      <PageHeader title="Reports" subtitle="Real figures, straight from your records." />

      <div className="mt-4 flex gap-2">
        {RANGES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRange(option.value)}
            className={cn(
              "h-9 flex-1 rounded-full border px-3 text-xs font-medium",
              range === option.value
                ? "border-primary bg-primary/5 text-ink"
                : "border-border text-muted-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="gradient-ink mt-4 rounded-2xl p-5">
        <p className="text-xs uppercase tracking-widest text-champagne/70">
          {range === "today" ? "Today's takings" : range === "month" ? "This month" : "This year"}
        </p>
        <p className="mt-1 font-display text-3xl text-background">
          {formatMoney(report.grossSales, currency)}
        </p>
        <p className="mt-1 text-xs text-background/70">
          {report.salesCount} sale{report.salesCount === 1 ? "" : "s"} · margin{" "}
          {formatMoney(margin, currency)}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Cash in" value={formatMoney(report.collected, currency)} />
        <Stat label="Debt collected" value={formatMoney(report.debtCollected, currency)} />
        <Stat label="Expenses" value={formatMoney(report.expenses, currency)} />
        <Stat label="Refunds" value={formatMoney(report.refunds, currency)} />
        <Stat label="Discounts given" value={formatMoney(report.discounts, currency)} />
        <Stat label="Cost of goods" value={formatMoney(report.costOfGoods, currency)} />
      </div>

      <div className="surface-panel mt-4 p-4">
        <p className="text-sm font-medium">Net cash position</p>
        <p className="mt-1 text-2xl font-semibold">{formatMoney(netCash, currency)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Money received (sales plus debt repayments) less expenses and refunds.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Owed to you" value={formatMoney(report.outstandingCredit, currency)} />
        <Stat label="Stock at cost" value={formatMoney(report.stockValue, currency)} />
      </div>

      {report.lowStockCount > 0 ? (
        <div className="surface-panel mt-4 border-destructive/30 p-4">
          <p className="text-sm font-medium text-destructive">
            {report.lowStockCount} product{report.lowStockCount === 1 ? "" : "s"} at or below the
            low-stock level
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Restock them from the Restock screen before they run out.
          </p>
        </div>
      ) : null}

      <div className="surface-panel mt-4 p-4">
        <p className="text-sm font-medium">Best sellers</p>
        {report.topProducts.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">No sales in this period yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {report.topProducts.map((product) => (
              <li key={product.name} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{product.name}</span>
                <span className="shrink-0 text-right">
                  {formatMoney(product.revenue, currency)}
                  <span className="block text-xs text-muted-foreground">
                    {product.quantity} sold
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-panel p-3.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
