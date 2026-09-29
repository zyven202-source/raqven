import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  ChevronRight,
  HandCoins,
  PackagePlus,
  ScanLine,
  TriangleAlert,
  Wallet,
} from "lucide-react";

import { EmptyState, ErrorState, LoadingState, PageContainer } from "@/components/app/AppChrome";
import { Money, SectionLabel } from "@/components/app/primitives";
import { OwnerOnly } from "@/components/app/OwnerOnly";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useShopReport, useTransactions } from "@/hooks/useLedger";
import { useTodayWindow } from "@/hooks/useReportingWindow";
import { formatMoney } from "@/lib/format";
import { kindLabel } from "@/services/transactions.service";

export const Route = createFileRoute("/_authenticated/app/overview")({
  head: () => ({ meta: [{ title: "Today — RAVQEN" }] }),
  component: () => (
    <OwnerOnly title="Today">
      <OverviewPage />
    </OwnerOnly>
  ),
});

/**
 * "Today" — the owner's answer to *what is happening in my shop right now?*
 *
 * Every figure comes from `shop_report`, which PostgreSQL computes and
 * re-checks ownership on. The wording is deliberately precise: takings are not
 * called profit, and the one derived figure that depends on recorded buying
 * prices is labelled an estimate, because that is what it is.
 */
function OverviewPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";

  const { from, to } = useTodayWindow();
  const reportQuery = useShopReport(shopId, from, to, Boolean(shopId));
  const recentQuery = useTransactions({ shopId, limit: 6 });
  if (reportQuery.isLoading) return <LoadingState label="Working out today's numbers…" />;
  if (reportQuery.isError) {
    return (
      <PageContainer>
        <ErrorState
          message={reportQuery.error.message}
          onRetry={() => void reportQuery.refetch()}
        />
      </PageContainer>
    );
  }

  const report = reportQuery.data;
  if (!report) {
    return (
      <PageContainer>
        <ErrorState
          message="The report came back empty. Try loading it again."
          onRetry={() => void reportQuery.refetch()}
        />
      </PageContainer>
    );
  }
  const grossProfit = report.grossSales - report.costOfGoods;
  const netResult = grossProfit - report.expenses;
  const hasSales = report.salesCount > 0;

  return (
    <PageContainer>
      <header className="mb-5">
        <p className="text-sm text-muted-foreground">
          {new Intl.DateTimeFormat("en-KE", {
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date())}
        </p>
        <h1 className="mt-0.5 text-[1.375rem] leading-tight">Today in {activeShop?.name}</h1>
      </header>

      {/* --------------------------------------------------- the day's headline */}
      <section className="mb-6">
        <SectionLabel>Takings</SectionLabel>
        <div className="glass-1 rounded-xl backdrop-blur-2xl backdrop-saturate-150 p-4">
          <p className="tnum text-[2.25rem] font-semibold leading-none">
            {formatMoney(report.grossSales, currency)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {hasSales
              ? `from ${report.salesCount} sale${report.salesCount === 1 ? "" : "s"} today`
              : "No sales recorded yet today"}
          </p>
          {report.discounts > 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              after {formatMoney(report.discounts, currency)} of discounts
            </p>
          ) : null}
        </div>
      </section>

      {/* ------------------------------------------- money in, money out, result */}
      <section className="mb-6">
        <SectionLabel>The day's result</SectionLabel>
        <dl className="list-divided">
          <Line
            label="Gross profit (estimate)"
            value={formatMoney(grossProfit, currency)}
            note="Takings less what the goods cost you"
            tone={grossProfit < 0 ? "negative" : "default"}
          />
          <Line
            label="Expenses"
            value={`− ${formatMoney(report.expenses, currency)}`}
            note={report.expenses > 0 ? "Logged today" : "Nothing logged today"}
          />
          <Line
            label="Net result (estimate)"
            value={formatMoney(netResult, currency)}
            note="Gross profit less expenses"
            tone={netResult < 0 ? "negative" : "positive"}
            emphasis
          />
          {report.refunds > 0 ? (
            <Line label="Refunds paid out" value={`− ${formatMoney(report.refunds, currency)}`} />
          ) : null}
        </dl>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Profit is an estimate: it uses the buying price recorded on each product, not what you
          actually paid on the last delivery.
        </p>
      </section>

      {/* ------------------------------------------------------------ shop pulse */}
      <section className="mb-6">
        <SectionLabel>Where the shop stands</SectionLabel>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          <Figure
            label="Money owed to you"
            value={formatMoney(report.outstandingCredit, currency)}
            note="Across all debtors"
          />
          <Figure
            label="Stock at cost"
            value={formatMoney(report.stockValue, currency)}
            note="What the shelves are worth"
          />
          <Figure
            label="Cash and mobile money taken"
            value={formatMoney(report.collected, currency)}
            note="Excludes credit sales"
          />
          <Figure
            label="Debt collected"
            value={formatMoney(report.debtCollected, currency)}
            note="Repayments received today"
          />
        </div>
      </section>

      {/* --------------------------------------------------------------- alerts */}
      {report.lowStockCount > 0 ? (
        <section className="mb-6">
          <Link
            to="/app/restock"
            search={{ shop: undefined }}
            className="flex items-center gap-3 rounded-xl border border-caution/40 bg-caution-soft/60 px-4 py-3.5 active:opacity-80"
          >
            <TriangleAlert className="size-5 shrink-0 text-caution" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">
                {report.lowStockCount} product
                {report.lowStockCount === 1 ? "" : "s"} running low
              </span>
              <span className="block text-xs text-muted-foreground">
                Worth restocking before they run out
              </span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </section>
      ) : null}

      {/* --------------------------------------------------------- quick actions */}
      <section className="mb-6">
        <SectionLabel>Do now</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <QuickAction to="/app/pos" icon={ScanLine} label="Make a sale" />
          <QuickAction to="/app/restock" icon={PackagePlus} label="Receive stock" />
          <QuickAction to="/app/expenses" icon={Wallet} label="Record expense" />
          <QuickAction to="/app/debtors" icon={HandCoins} label="Take a repayment" />
        </div>
      </section>

      {/* ------------------------------------------------------- recent activity */}
      <section>
        <SectionLabel
          action={
            <Link
              to="/app/transactions"
              search={{ shop: undefined }}
              className="text-xs font-medium text-ink-soft"
            >
              See all
            </Link>
          }
        >
          Recent activity
        </SectionLabel>

        {recentQuery.isLoading ? (
          <LoadingState label="Loading recent activity…" />
        ) : recentQuery.isError ? (
          <ErrorState
            message={recentQuery.error.message}
            onRetry={() => void recentQuery.refetch()}
          />
        ) : (recentQuery.data ?? []).length === 0 ? (
          <EmptyState
            title="Nothing has happened yet"
            description="Sales, stock deliveries and expenses will show up here as soon as they are recorded."
          />
        ) : (
          <ul className="list-divided">
            {(recentQuery.data ?? []).map((row) => (
              <li key={row.id}>
                <Link
                  to="/app/transactions"
                  search={{ shop: undefined }}
                  className="flex items-center gap-3 py-3 active:opacity-70"
                >
                  <span
                    className={
                      row.direction === "in"
                        ? "text-positive"
                        : row.direction === "out"
                          ? "text-negative"
                          : "text-muted-foreground"
                    }
                    aria-hidden
                  >
                    {row.direction === "in" ? (
                      <ArrowUpRight className="size-4" />
                    ) : (
                      <ArrowUpRight className="size-4 -scale-x-100" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{row.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {kindLabel(row.kind)} · {row.subtitle ?? row.reference ?? ""}
                    </span>
                  </span>
                  <span className="shrink-0">
                    <Money
                      amount={row.direction === "out" ? -row.amount : row.amount}
                      currency={currency}
                      className="text-sm font-semibold"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
  note?: string;
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

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tnum mt-0.5 text-base font-semibold">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{note}</p>
    </div>
  );
}

function QuickAction({
  to,
  icon: Icon,
  label,
}: {
  to: "/app/pos" | "/app/restock" | "/app/expenses" | "/app/debtors";
  icon: typeof ScanLine;
  label: string;
}) {
  return (
    <Link
      to={to}
      search={{ shop: undefined }}
      className="glass-2 press hover-glass flex min-h-12 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium backdrop-blur-md backdrop-saturate-150"
    >
      <Icon className="size-4 shrink-0 text-ink-soft" aria-hidden />
      {label}
    </Link>
  );
}
