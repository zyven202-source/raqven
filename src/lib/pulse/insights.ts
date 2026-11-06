/**
 * SAVO Pulse — the insight engine.
 *
 * Deterministic by construction: every insight is a named rule over figures
 * already computed from the shop's own rows. There is no randomness, no model
 * and no external call — the same inputs always produce the same insights, in
 * the same order, which is what makes them testable and explainable.
 *
 * Rules that fire only on sufficient data say so; rules that need a comparison
 * refuse to fire when either side is empty rather than inventing a percentage.
 * Every insight carries its window, its evidence and a confidence class, so a
 * shopkeeper can always see what a statement is standing on.
 */
import { formatMoney } from "@/lib/format";
import type {
  Confidence,
  Insight,
  InsightSeverity,
  MetricDelta,
  PeriodPair,
  ProductLine,
  PulseOverview,
  ForecastRow,
} from "@/lib/pulse/types";
import { delta } from "@/lib/pulse/metrics";

/** Below this many sales in a window, per-product comparisons mislead. */
const MIN_SALES_FOR_COMPARISON = 3;

/** The relative movement that makes a change worth saying out loud. */
const SALES_CHANGE_PCT = 20;
const PROFIT_CHANGE_PCT = 25;
const EXPENSE_CHANGE_PCT = 25;

/** An expense increase smaller than one currency unit is rounding, not news. */
const EXPENSE_FLOOR = 1;

export interface InsightInput {
  currency: string;
  pair: PeriodPair;
  current: PulseOverview;
  previous: PulseOverview;
  currentLines: ProductLine[];
  previousLines: ProductLine[];
  forecasts: ForecastRow[];
  expenseByCategory: { category: string; current: number; previous: number }[];
  /** Active products whose recorded buying price is zero but that sold in the window. */
  productsMissingCosts: string[];
  /** Active products with stock, created before the window, that sold nothing in it. */
  productsNoSales: { name: string; stockValue: number }[];
  computedAt: Date;
}

/** The comparison-confidence class shared by the window-on-window rules. */
function comparisonConfidence(currentCount: number, previousCount: number): Confidence {
  if (currentCount >= 10 && previousCount >= 10) return "high";
  if (currentCount >= MIN_SALES_FOR_COMPARISON && previousCount >= MIN_SALES_FOR_COMPARISON)
    return "moderate";
  return "low";
}

function percentSentence(
  label: string,
  change: MetricDelta,
  format: (n: number) => string,
): string {
  const direction = change.abs >= 0 ? "up" : "down";
  const pct = change.pct === null ? null : Math.round(Math.abs(change.pct));
  return pct === null
    ? `${label}: ${format(change.current)} — nothing recorded in the comparison window.`
    : `${label} ${direction} ${pct}% — ${format(change.current)} versus ${format(
        change.previous,
      )} in the comparison window.`;
}

/**
 * Builds the ordered insight feed. Pure: same input, same output, always.
 */
export function buildInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];
  const format = (value: number) => formatMoney(value, input.currency);
  const window = {
    fromIso: input.pair.current.from.toISOString(),
    toIso: input.pair.current.to.toISOString(),
    label: input.pair.current.label,
  };
  const computedAtIso = input.computedAt.toISOString();
  const periodKey = input.pair.current.from.toISOString();

  const make = (partial: Omit<Insight, "computedAtIso" | "window">): Insight => ({
    ...partial,
    window,
    computedAtIso,
  });

  /* ---------------------------------------------------- 1. sparse history */
  if (input.current.salesCount < MIN_SALES_FOR_COMPARISON) {
    insights.push(
      make({
        id: `thin_history:${periodKey}`,
        type: "thin_history",
        title: "Not much history in this window yet",
        body: `This window holds ${input.current.salesCount} recorded sale${
          input.current.salesCount === 1 ? "" : "s"
        }. Pulse needs a few more before comparisons and per-product trends say anything reliable — nothing here is being guessed in the meantime.`,
        severity: "info",
        confidence: "insufficient",
        evidence: [
          { label: "Sales in window", value: String(input.current.salesCount) },
          { label: "Window", value: input.pair.current.label },
        ],
      }),
    );
  }

  /* ------------------------------------------------------- 2. stockouts */
  const urgent = input.forecasts
    .filter((row) => row.bucket === "urgent")
    .sort((a, b) => (a.daysRemaining ?? 99) - (b.daysRemaining ?? 99))
    .slice(0, 3);
  for (const row of urgent) {
    insights.push(
      make({
        id: `stockout_risk:${row.productId}:${periodKey}`,
        type: "stockout_risk",
        title: `${row.name} may run out soon`,
        body:
          row.daysRemaining !== null
            ? `About ${row.daysRemaining} day${row.daysRemaining === 1 ? "" : "s"} of stock left at its recent selling rate (${row.unitsSold} sold in the observation window).`
            : `It is at or below its reorder threshold of ${row.threshold}.`,
        severity: "urgent",
        confidence: row.confidence,
        evidence: [
          { label: "On the shelf", value: `${row.stock} ${row.unit}` },
          { label: "Reorder threshold", value: `${row.threshold} ${row.unit}` },
          {
            label: "Recent rate",
            value:
              row.avgDailyDemand !== null
                ? `${row.avgDailyDemand.toFixed(2)}/day`
                : "not enough data",
          },
        ],
        action: { label: "Open receive stock", to: "/app/restock" },
      }),
    );
  }

  /* --------------------------------------------------- 3. sales movement */
  const salesChange = delta(input.current.grossSales, input.previous.grossSales);
  const canCompareSales =
    input.current.salesCount >= MIN_SALES_FOR_COMPARISON &&
    input.previous.salesCount >= MIN_SALES_FOR_COMPARISON;
  if (
    canCompareSales &&
    salesChange.pct !== null &&
    Math.abs(salesChange.pct) >= SALES_CHANGE_PCT
  ) {
    insights.push(
      make({
        id: `sales_change:${periodKey}`,
        type: "sales_change",
        title: `Sales ${salesChange.abs >= 0 ? "up" : "down"} ${Math.round(
          Math.abs(salesChange.pct),
        )}% versus the previous period`,
        body: percentSentence("Recorded sales", salesChange, format),
        severity: salesChange.abs >= 0 ? "info" : "attention",
        confidence: comparisonConfidence(input.current.salesCount, input.previous.salesCount),
        evidence: [
          { label: input.pair.current.label, value: format(input.current.grossSales) },
          { label: input.pair.previous.label, value: format(input.previous.grossSales) },
          {
            label: "Sales count",
            value: `${input.current.salesCount} vs ${input.previous.salesCount}`,
          },
        ],
      }),
    );
  }

  /* --------------------------------------------------- 4. profit movement */
  const profitChange = delta(input.current.estGrossProfit, input.previous.estGrossProfit);
  const canCompareProfit =
    input.current.salesCount >= MIN_SALES_FOR_COMPARISON &&
    input.previous.salesCount >= MIN_SALES_FOR_COMPARISON &&
    input.previous.grossSales > 0;
  if (
    canCompareProfit &&
    profitChange.pct !== null &&
    Math.abs(profitChange.pct) >= PROFIT_CHANGE_PCT
  ) {
    insights.push(
      make({
        id: `profit_change:${periodKey}`,
        type: "profit_change",
        title: `Estimated profit ${profitChange.abs >= 0 ? "up" : "down"} ${Math.round(
          Math.abs(profitChange.pct),
        )}% versus the previous period`,
        body: `${percentSentence("Estimated gross profit", profitChange, format)} It uses the buying price recorded on each product, not what the last delivery actually cost.`,
        severity: profitChange.abs >= 0 ? "info" : "attention",
        confidence: comparisonConfidence(input.current.salesCount, input.previous.salesCount),
        evidence: [
          { label: input.pair.current.label, value: format(input.current.estGrossProfit) },
          { label: input.pair.previous.label, value: format(input.previous.estGrossProfit) },
          { label: "Recorded expenses", value: format(input.current.expenses) },
        ],
      }),
    );
  }

  /* --------------------------------------------------- 5. expense shifts */
  const rising = input.expenseByCategory
    .filter(
      (row) =>
        row.previous > 0 &&
        row.current >= row.previous &&
        row.current - row.previous >= EXPENSE_FLOOR &&
        ((row.current - row.previous) / row.previous) * 100 >= EXPENSE_CHANGE_PCT,
    )
    .sort((a, b) => b.current - a.current - (a.previous - b.previous))
    .slice(0, 2);
  for (const row of rising) {
    const change = delta(row.current, row.previous);
    insights.push(
      make({
        id: `expense_change:${row.category}:${periodKey}`,
        type: "expense_change",
        title: `${row.category.charAt(0).toUpperCase()}${row.category.slice(1)} spending up ${Math.round(
          change.pct ?? 0,
        )}%`,
        body: percentSentence(`${row.category} expenses`, change, format),
        severity: "attention",
        confidence: "moderate",
        evidence: [
          { label: input.pair.current.label, value: format(row.current) },
          { label: input.pair.previous.label, value: format(row.previous) },
        ],
        action: { label: "Open expenses", to: "/app/expenses" },
      }),
    );
  }

  /* ------------------------------------------------ 6. declining products */
  const previousByProduct = new Map(
    input.previousLines.filter((line) => line.productId).map((line) => [line.productId!, line]),
  );
  const declining = input.currentLines
    .filter((line) => {
      if (!line.productId) return false;
      const previous = previousByProduct.get(line.productId);
      return (
        previous !== undefined && previous.quantity >= 5 && line.quantity <= previous.quantity * 0.6
      );
    })
    .sort(
      (a, b) =>
        (previousByProduct.get(b.productId!)?.quantity ?? 0) -
        (previousByProduct.get(a.productId!)?.quantity ?? 0),
    )
    .slice(0, 3);
  for (const line of declining) {
    const previous = previousByProduct.get(line.productId!);
    if (!previous) continue;
    insights.push(
      make({
        id: `declining_product:${line.productId}:${periodKey}`,
        type: "declining_product",
        title: `${line.name} is selling less`,
        body: `${line.quantity} recorded ${line.quantity === 1 ? "unit" : "units"} sold this period, versus ${previous.quantity} in the comparison window.`,
        severity: "info",
        confidence: comparisonConfidence(line.lines, previous.lines),
        evidence: [
          { label: input.pair.current.label, value: `${line.quantity} ${line.name}` },
          { label: input.pair.previous.label, value: `${previous.quantity} ${line.name}` },
        ],
        action: { label: "Open inventory", to: "/app/inventory" },
      }),
    );
  }

  /* --------------------------------------- 7. products with no recent sales */
  // Calendar days the window touches (a "last 7 days" preset spans six and a
  // half elapsed days at midday but seven real dates).
  const windowDays = Math.ceil(
    (input.pair.current.to.getTime() - input.pair.current.from.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (windowDays >= 7) {
    for (const product of input.productsNoSales.slice(0, 3)) {
      insights.push(
        make({
          id: `no_recent_sales:${product.name}:${periodKey}`,
          type: "no_recent_sales",
          title: `${product.name} has not sold in this window`,
          body: `It is in stock (${format(product.stockValue)} at recorded cost) with no recorded sales in the ${input.pair.current.label.toLowerCase()}. Worth checking whether it is priced, placed or promoted right.`,
          severity: "info",
          confidence: "moderate",
          evidence: [
            { label: "Stock at recorded cost", value: format(product.stockValue) },
            { label: "Recorded sales", value: "0" },
          ],
          action: { label: "Open inventory", to: "/app/inventory" },
        }),
      );
    }
  }

  /* ------------------------------------------------ 8. missing cost data */
  if (input.productsMissingCosts.length > 0) {
    const names = input.productsMissingCosts.slice(0, 3).join(", ");
    insights.push(
      make({
        id: `missing_cost_data:${periodKey}`,
        type: "missing_cost_data",
        title: "Profit estimates are missing some costs",
        body: `${input.productsMissingCosts.length} product${
          input.productsMissingCosts.length === 1 ? " sells" : "s sell"
        } with no recorded buying price (${names}${
          input.productsMissingCosts.length > 3 ? ", …" : ""
        }). Their sales count toward revenue here, but not toward profit — update the buying price to tighten the estimate.`,
        severity: "attention",
        confidence: "high",
        evidence: [
          {
            label: "Products without a buying price",
            value: String(input.productsMissingCosts.length),
          },
          { label: "Affects", value: "Estimated gross profit" },
        ],
        action: { label: "Open inventory", to: "/app/inventory" },
      }),
    );
  }

  /* ------------------------------------------------------- 9. credit owed */
  if (input.current.outstandingCredit > 0) {
    insights.push(
      make({
        id: "credit_outstanding",
        type: "credit_outstanding",
        title: "Credit is still outstanding",
        body: `${format(input.current.outstandingCredit)} is owed to the shop right now. Nothing has been sent to anyone — open Debtors when you want to review the list and act on it.`,
        severity: "info",
        confidence: "high",
        evidence: [{ label: "Outstanding now", value: format(input.current.outstandingCredit) }],
        action: { label: "Open debtors", to: "/app/debtors" },
      }),
    );
  }

  return sortInsights(insights);
}

const SEVERITY_ORDER: Record<InsightSeverity, number> = { urgent: 0, attention: 1, info: 2 };

/** Urgent first, then attention, then information; stable within a severity. */
export function sortInsights(insights: Insight[]): Insight[] {
  return insights
    .map((insight, index) => ({ insight, index }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.insight.severity] - SEVERITY_ORDER[b.insight.severity] ||
        a.index - b.index,
    )
    .map((entry) => entry.insight);
}
