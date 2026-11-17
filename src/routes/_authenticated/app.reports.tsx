import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { PhotoBanner } from "@/components/app/PhotoBanner";
import { PHOTOGRAPHY } from "@/lib/photography";
import { ExportReportButton } from "@/components/app/ExportReportButton";
import { OwnerOnly } from "@/components/app/OwnerOnly";
import { SectionLabel } from "@/components/app/primitives";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useShopReport } from "@/hooks/useLedger";
import { useMinuteNow } from "@/hooks/useReportingWindow";
import { formatMoney } from "@/lib/format";
import { startOfDay, startOfMonth } from "@/services/reports.service";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({ meta: [{ title: "SAVO — Reports" }] }),
  component: () => (
    <OwnerOnly title="Reports">
      <ReportsPage />
    </OwnerOnly>
  ),
});

type Range = "today" | "month" | "year";

const RANGES: { value: Range; label: string; period: string }[] = [
  { value: "today", label: "Today", period: "today" },
  { value: "month", label: "This month", period: "this month" },
  { value: "year", label: "This year", period: "this year" },
];

function rangeBounds(range: Range, now: Date): { from: Date; to: Date } {
  if (range === "today") return { from: startOfDay(now), to: now };
  if (range === "month") return { from: startOfMonth(now), to: now };
  return { from: new Date(now.getFullYear(), 0, 1), to: now };
}

/**
 * Owner reporting.
 *
 * The wording is the important part. Takings are not profit. Gross profit is
 * takings minus what the goods cost, which is an estimate because it uses the
 * buying price on file rather than the last invoice. Net result is that less
 * expenses. Every number is computed in PostgreSQL, which re-checks that the
 * caller owns the shop before it returns anything.
 */
function ReportsPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";
  const [range, setRange] = useState<Range>("today");

  // The window has to be stable across renders, or the query key changes on
  // every pass and the report never finishes loading.
  const now = useMinuteNow();
  const bounds = rangeBounds(range, now);
  const reportQuery = useShopReport(shopId, bounds.from, bounds.to, Boolean(shopId));
  const activeRange = RANGES.find((option) => option.value === range);

  if (reportQuery.isLoading) {
    return <LoadingState label="Working out the numbers…" />;
  }

  if (reportQuery.isError) {
    return (
      <PageContainer>
        <PageHeader eyebrow="Insight" title="Reports" />
        <div className="mt-4">
          <ErrorState
            message={reportQuery.error.message}
            onRetry={() => void reportQuery.refetch()}
          />
        </div>
      </PageContainer>
    );
  }

  const report = reportQuery.data;
  if (!report) {
    return (
      <PageContainer>
        <PageHeader eyebrow="Insight" title="Reports" />
        <PhotoBanner
          photo={PHOTOGRAPHY.reports}
          caption="How the period went, in numbers."
          className="mb-4"
        />
        <div className="mt-4">
          <ErrorState
            message="The report came back empty. Try loading it again."
            onRetry={() => void reportQuery.refetch()}
          />
        </div>
      </PageContainer>
    );
  }

  const grossProfit = report.grossSales - report.costOfGoods;
  const netResult = grossProfit - report.expenses;
  const nothingYet = report.salesCount === 0 && report.expenses === 0;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Insight"
        title="Reports"
        subtitle="Figures taken straight from your records."
        action={
          <ExportReportButton
            input={{
              shopId,
              shopName: activeShop?.name ?? "Shop",
              currency,
              periodLabel: activeRange?.label ?? "This period",
              from: bounds.from,
              to: bounds.to,
              report,
            }}
            onError={(message) =>
              toast.error(message, {
                description: "Nothing was changed. You can try again.",
                duration: 8000,
              })
            }
          />
        }
      />

      <div className="mb-4 flex gap-1.5">
        {RANGES.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setRange(option.value)}
            aria-pressed={range === option.value}
            className={
              "press h-10 flex-1 rounded-lg border text-sm font-medium " +
              (range === option.value
                ? "border-ink bg-ink text-background"
                : "border-border text-muted-foreground")
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      {nothingYet ? (
        <EmptyState
          title="Nothing recorded yet"
          description={`There is no trading to report for ${activeRange?.period ?? "this period"}. Once you make a sale or log an expense, the figures appear here.`}
        />
      ) : null}

      {/* ------------------------------------------------------- takings */}
      <section className="mb-6">
        <SectionLabel>Takings</SectionLabel>
        <div className="glass-1 rounded-xl p-4">
          <p className="tnum text-[2rem] font-semibold leading-none">
            {formatMoney(report.grossSales, currency)}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {report.salesCount === 0
              ? "No sales in this period"
              : `from ${report.salesCount} sale${report.salesCount === 1 ? "" : "s"}`}
          </p>
          {report.discounts > 0 ? (
            <p className="mt-0.5 text-xs text-muted-foreground">
              after {formatMoney(report.discounts, currency)} of discounts
            </p>
          ) : null}
        </div>
      </section>

      {/* -------------------------------------------------------- result */}
      <section className="mb-6">
        <SectionLabel>How that adds up</SectionLabel>
        <dl className="list-divided">
          <Line label="Takings" value={formatMoney(report.grossSales, currency)} />
          <Line
            label="Cost of the goods sold"
            value={`− ${formatMoney(report.costOfGoods, currency)}`}
          />
          <Line
            label="Gross profit (estimate)"
            value={formatMoney(grossProfit, currency)}
            note="Uses the buying price on each product, not your last invoice."
            tone={grossProfit < 0 ? "negative" : "default"}
            emphasis
          />
          <Line
            label="Expenses"
            value={`− ${formatMoney(report.expenses, currency)}`}
            note={report.expenses > 0 ? "Lunch, transport, rent and the rest" : "Nothing recorded"}
          />
          <Line
            label="Net result (estimate)"
            value={formatMoney(netResult, currency)}
            tone={netResult < 0 ? "negative" : "positive"}
            emphasis
          />
        </dl>
      </section>

      {/* ---------------------------------------------------------- cash */}
      <section className="mb-6">
        <SectionLabel>Money in and out</SectionLabel>
        <dl className="list-divided">
          <Line
            label="Taken at the till"
            value={formatMoney(report.collected, currency)}
            note="Cash, card and mobile money"
          />
          <Line
            label="Collected from debtors"
            value={formatMoney(report.debtCollected, currency)}
          />
          {report.refunds > 0 ? (
            <Line
              label="Paid back as refunds"
              value={`− ${formatMoney(report.refunds, currency)}`}
            />
          ) : null}
          <Line
            label="Paid out in total"
            value={`− ${formatMoney(report.expenses + report.refunds, currency)}`}
          />
        </dl>
      </section>

      {/* ----------------------------------------------------- the shop */}
      <section className="mb-6">
        <SectionLabel>Where the shop stands</SectionLabel>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Figure
            label="Owed to you"
            value={formatMoney(report.outstandingCredit, currency)}
            note="Across every debtor"
          />
          <Figure
            label="Stock at cost"
            value={formatMoney(report.stockValue, currency)}
            note="What the shelves hold"
          />
          <Figure
            label="Products below reorder level"
            value={String(report.lowStockCount)}
            note={report.lowStockCount > 0 ? "Worth topping up" : "Everything is well stocked"}
            tone={report.lowStockCount > 0 ? "caution" : "positive"}
          />
          <Figure
            label="Products being sold"
            value={String(report.topProducts.length)}
            note="In this period"
          />
        </div>
      </section>

      {/* -------------------------------------------------- best sellers */}
      <section>
        <SectionLabel>What is selling</SectionLabel>
        {report.topProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No products were sold in this period, so there is nothing to rank.
          </p>
        ) : (
          <ol className="list-divided">
            {report.topProducts.map((product, index) => (
              <li key={product.name} className="flex items-center gap-3 py-2.5">
                <span
                  className="tnum w-5 shrink-0 text-sm font-semibold text-muted-foreground"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{product.name}</span>
                  <span className="tnum block text-xs text-muted-foreground">
                    {product.quantity} sold
                  </span>
                </span>
                <span className="tnum shrink-0 text-sm font-semibold">
                  {formatMoney(product.revenue, currency)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </PageContainer>
  );
}

function Line({
  label,
  value,
  note,
  tone = "default",
  emphasis = false,
}: {
  label: string;
  value: string;
  note?: string | undefined;
  tone?: "default" | "positive" | "negative";
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className={emphasis ? "text-sm font-semibold" : "text-sm"}>{label}</p>
        {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
      </div>
      <p
        className={
          "tnum shrink-0 text-right " +
          (emphasis ? "text-base font-semibold " : "text-sm ") +
          (tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "")
        }
      >
        {value}
      </p>
    </div>
  );
}

function Figure({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "positive" | "caution";
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={
          "tnum mt-0.5 text-base font-semibold " +
          (tone === "caution" ? "text-caution" : tone === "positive" ? "text-positive" : "")
        }
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}
