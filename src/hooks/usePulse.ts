/**
 * Pith Pulse — the data hook.
 *
 * One place that owns: which windows are selected, which queries serve them,
 * how obsolete work is cancelled, and where the pure engine runs. The rules
 * it keeps:
 *
 *   - Shop isolation lives in the query key. Another shop is another key, so
 *     React Query can never serve the previous shop's figures — there is no
 *     "clear on switch" step that could be forgotten. RLS is the real guard.
 *   - Obsolete windows are cancelled, not raced: every fetch takes the query
 *     AbortSignal, so switching period aborts the previous period's requests
 *     and a slow old response can never overwrite a newer selection.
 *   - Reports (the cheap owner-only RPCs) refresh on the minute, like the
 *     dashboard. The heavier row fetches are bucketed to five minutes so a
 *     screen left open does not poll the database every tick.
 *   - No placeholder data: a period switch shows its skeleton rather than the
 *     previous period's numbers wearing the new period's label.
 *   - The engine itself is pure (`src/lib/pulse/*`) and runs in a memo over
 *     already-fetched rows — never on the network, never per keystroke.
 */
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useMinuteNow } from "@/hooks/useReportingWindow";

import {
  aggregateProductLines,
  dailyTotals,
  expenseTotalsByCategory,
  overviewFromReport,
  resolvePeriodPair,
  sliceLines,
  type SaleLine,
} from "@/lib/pulse/metrics";
import { buildForecasts } from "@/lib/pulse/forecast";
import { buildInsights } from "@/lib/pulse/insights";
import type {
  AskContext,
  ForecastRow,
  Insight,
  PeriodPair,
  PulseOverview,
  PulsePeriodId,
} from "@/lib/pulse/types";
import {
  firstSaleAt,
  getPulseReport,
  listExpenseRows,
  listPulseProducts,
  listSaleLines,
} from "@/services/pulse.service";

/** Row fetches are bucketed to this interval; a left-open screen refetches at most this often. */
const ROW_BUCKET_MS = 5 * 60 * 1000;

const EMPTY_OVERVIEW: PulseOverview = {
  grossSales: 0,
  netSales: 0,
  estGrossProfit: 0,
  expenses: 0,
  netResult: 0,
  salesCount: 0,
  avgTransaction: null,
  stockValue: 0,
  outstandingCredit: 0,
  restockCount: 0,
  collected: 0,
  debtCollected: 0,
  refunds: 0,
  discounts: 0,
};

export interface PulseCustomRange {
  from: Date;
  to: Date;
}

export function usePulse(
  shopId: string,
  currency: string,
  periodId: PulsePeriodId,
  custom: PulseCustomRange | null,
) {
  const now = useMinuteNow();
  const customFrom = custom?.from.getTime();
  const customTo = custom?.to.getTime();

  const pair: PeriodPair = useMemo(
    () =>
      resolvePeriodPair(
        periodId,
        now,
        customFrom !== undefined && customTo !== undefined
          ? { from: new Date(customFrom), to: new Date(customTo) }
          : undefined,
      ),
    [periodId, now, customFrom, customTo],
  );

  const enabled = Boolean(shopId);

  /* ------------------------------------------------------------ headlines */
  const reportQuery = useQuery({
    queryKey: [
      "pulse-report",
      shopId,
      pair.current.from.toISOString(),
      pair.current.to.toISOString(),
      pair.previous.from.toISOString(),
    ],
    queryFn: ({ signal }) =>
      Promise.all([
        getPulseReport(shopId, pair.current.from, pair.current.to, signal),
        getPulseReport(shopId, pair.previous.from, pair.previous.to, signal),
      ]),
    enabled,
    // Owners only; an employee gets a permission error from the database and
    // there is no point retrying it — the screen says so instead.
    retry: false,
    staleTime: 60_000,
  });

  /* --------------------------------------------------------- row fetches */
  const bucket = Math.floor(now.getTime() / ROW_BUCKET_MS);
  const rowTo = new Date((bucket + 1) * ROW_BUCKET_MS);

  const linesQuery = useQuery({
    queryKey: ["pulse-lines", shopId, pair.fetchFrom.toISOString(), bucket],
    queryFn: ({ signal }) => listSaleLines(shopId, pair.fetchFrom, rowTo, signal),
    enabled,
    retry: 1,
    staleTime: 60_000,
  });

  const expensesQuery = useQuery({
    queryKey: ["pulse-expenses", shopId, pair.fetchFrom.toISOString(), bucket],
    queryFn: ({ signal }) => listExpenseRows(shopId, pair.fetchFrom, rowTo, signal),
    enabled,
    retry: 1,
    staleTime: 60_000,
  });

  const productsQuery = useQuery({
    queryKey: ["pulse-products", shopId, bucket],
    queryFn: ({ signal }) => listPulseProducts(shopId, signal),
    enabled,
    retry: 1,
    staleTime: 60_000,
  });

  const firstSaleQuery = useQuery({
    queryKey: ["pulse-first-sale", shopId, bucket],
    queryFn: ({ signal }) => firstSaleAt(shopId, signal),
    enabled,
    retry: 1,
    staleTime: 60_000,
  });

  /* --------------------------------------------------------- computations */
  const computed = useMemo(() => {
    const reportPair = reportQuery.data;
    const rawLines = linesQuery.data ?? [];
    const expenseRows = expensesQuery.data ?? [];
    const products = productsQuery.data ?? [];
    const firstSale = firstSaleQuery.data ?? null;

    const currentOverview: PulseOverview | null = reportPair
      ? overviewFromReport(reportPair[0])
      : null;
    const previousOverview: PulseOverview | null = reportPair
      ? overviewFromReport(reportPair[1])
      : null;

    const currentRaw = currentOverview ? sliceLines(rawLines, pair.current) : [];
    const previousRaw = currentOverview ? sliceLines(rawLines, pair.previous) : [];
    const currentLines = aggregateProductLines(currentRaw);
    const previousLines = aggregateProductLines(previousRaw);

    // The forecast's own observation window: the last 14 days, regardless of
    // the reporting period selected — a restock decision wants recent rate,
    // not the selected comparison window.
    const observationFrom = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const observationLines = rawLines.filter(
      (line: SaleLine) => new Date(line.soldAt).getTime() >= observationFrom.getTime(),
    );
    const activeDays = new Set(observationLines.map((line) => line.soldAt.slice(0, 10))).size;

    const forecasts: ForecastRow[] = buildForecasts({
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        unit: product.unit,
        stock: product.stock,
        threshold: product.threshold,
        createdAt: product.createdAt,
      })),
      windowLines: observationLines,
      now,
      activeDays,
      firstSaleAt: firstSale,
    });

    const currentExpenseRows = expenseRows.filter((row) => {
      const time = new Date(row.spentAt).getTime();
      return time >= pair.current.from.getTime() && time < pair.current.to.getTime();
    });
    const previousExpenseRows = expenseRows.filter((row) => {
      const time = new Date(row.spentAt).getTime();
      return time >= pair.previous.from.getTime() && time < pair.previous.to.getTime();
    });
    const expenseTotals = expenseTotalsByCategory(currentExpenseRows, previousExpenseRows);

    const soldProductIds = new Set(
      currentLines.map((line) => line.productId).filter((id): id is string => Boolean(id)),
    );
    const productsMissingCosts = products
      .filter(
        (product) =>
          product.buyingPrice === 0 && product.sellingPrice > 0 && soldProductIds.has(product.id),
      )
      .map((product) => product.name);

    const productsNoSales = products
      .filter(
        (product) =>
          product.stock > 0 &&
          new Date(product.createdAt) < pair.current.from &&
          !soldProductIds.has(product.id),
      )
      .map((product) => ({ name: product.name, stockValue: product.stock * product.buyingPrice }))
      .sort((a, b) => b.stockValue - a.stockValue)
      .slice(0, 5);

    const thinHistory = (currentOverview?.salesCount ?? 0) < 3;

    const insights: Insight[] =
      currentOverview && previousOverview
        ? buildInsights({
            currency,
            pair,
            current: currentOverview,
            previous: previousOverview,
            currentLines,
            previousLines,
            forecasts,
            expenseByCategory: expenseTotals,
            productsMissingCosts,
            productsNoSales,
            computedAt: now,
          })
        : [];

    const askContext: AskContext | null =
      currentOverview && previousOverview
        ? {
            currency,
            periodLabel: pair.current.label,
            current: currentOverview,
            previous: previousOverview,
            productLines: currentLines,
            previousLines,
            forecasts,
            expenseByCategory: expenseTotals,
            thinHistory,
          }
        : null;

    return {
      currentOverview,
      previousOverview,
      currentLines,
      previousLines,
      currentRaw,
      previousRaw,
      forecasts,
      expenseTotals,
      productsMissingCosts,
      productsNoSales,
      thinHistory,
      insights,
      askContext,
      trend: dailyTotals(currentRaw, pair.current),
    };
  }, [
    reportQuery.data,
    linesQuery.data,
    expensesQuery.data,
    productsQuery.data,
    firstSaleQuery.data,
    pair,
    now,
    currency,
  ]);

  const isPending = enabled && reportQuery.isPending;
  const isError = reportQuery.isError || linesQuery.isError;
  const error = reportQuery.error ?? linesQuery.error;
  const refetch = () => {
    void reportQuery.refetch();
    void linesQuery.refetch();
    void expensesQuery.refetch();
    void productsQuery.refetch();
    void firstSaleQuery.refetch();
  };

  const dataUpdatedAt = Math.max(
    reportQuery.dataUpdatedAt,
    linesQuery.dataUpdatedAt,
    expensesQuery.dataUpdatedAt,
    productsQuery.dataUpdatedAt,
  );

  return {
    pair,
    now,
    isPending,
    isError,
    error,
    refetch,
    dataUpdatedAt,
    sectionsPending: {
      report: reportQuery.isPending || reportQuery.isError,
      lines: linesQuery.isPending || linesQuery.isError,
      products: productsQuery.isPending || productsQuery.isError,
      expenses: expensesQuery.isPending || expensesQuery.isError,
    },
    ...computed,
  };
}
