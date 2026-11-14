/**
 * SAVO Pulse — period math and metric aggregation.
 *
 * Definitions, stated once, so every screen that quotes a number agrees:
 *
 *   Gross sales        `sales.total_amount` summed over the window. This is
 *                      SAVO's established figure — the same sum `shop_report`
 *                      returns and the Reports screen shows as "takings".
 *   Net sales          Gross sales less refunds recorded (not rejected) in
 *                      the window. Discounts are already inside
 *                      `total_amount`; subtracting them again would double
 *                      count, so they are shown as their own line instead.
 *   Est. gross profit  Gross sales less `sale_items.quantity × buying_price`
 *                      over the window — the recorded buying price, not what
 *                      the last delivery actually cost. Estimated, labelled
 *                      estimated, everywhere it appears.
 *   Net result         Estimated gross profit less recorded expenses. Known
 *                      costs only; it is not "net profit" and never says so.
 *   Avg transaction    Gross sales ÷ number of sale rows.
 *
 * Sales rows are counted whatever their payment state (completed, partial or
 * pending): a credit sale took goods off the shelf the moment it was recorded,
 * and `shop_report` — the source of truth Pulse reconciles against — counts it
 * the same way. Cash actually received is the separate `collected` figure.
 */
import type { ShopReport } from "@/services/reports.service";
import type {
  DailyTotal,
  MetricDelta,
  PeriodPair,
  ProductLine,
  PulseOverview,
  PulsePeriod,
  PulsePeriodId,
} from "@/lib/pulse/types";

/**
 * The longest window Pulse will aggregate in the browser. Ninety-two days
 * covers the largest selectable preset (a month) twice — the current window
 * plus its comparison — with room for the longest custom range; beyond that,
 * client-side aggregation would be the wrong tool and the UI refuses it.
 */
export const MAX_WINDOW_DAYS = 92;

/** One raw sale line, normalised. `soldAt` is the sale's timestamp, not the item's. */
export interface SaleLine {
  soldAt: string;
  productId: string | null;
  productName: string;
  quantity: number;
  /** Line revenue as recorded (`sale_items.subtotal`). */
  subtotal: number;
  /** Recorded buying price per unit for this line. */
  buyingPrice: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight of the day `date` falls on — the day a shopkeeper means. */
export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function startOfMonth(date: Date): Date {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

const PRESET_LABELS: Record<Exclude<PulsePeriodId, "custom">, string> = {
  today: "Today",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  month: "This month",
};

function preset(id: Exclude<PulsePeriodId, "custom">, now: Date): PulsePeriod {
  switch (id) {
    case "today":
      return { id, from: startOfDay(now), to: now, label: PRESET_LABELS.today };
    case "7d":
      return {
        id,
        from: new Date(startOfDay(now).getTime() - 6 * DAY_MS),
        to: now,
        label: PRESET_LABELS["7d"],
      };
    case "30d":
      return {
        id,
        from: new Date(startOfDay(now).getTime() - 29 * DAY_MS),
        to: now,
        label: PRESET_LABELS["30d"],
      };
    case "month":
      return { id, from: startOfMonth(now), to: now, label: PRESET_LABELS.month };
  }
}

/** Days between two instants, counted as whole calendar days (min 1). */
function calendarDays(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.max(1, Math.ceil(ms / DAY_MS));
}

/**
 * The selected window and the equally long window immediately before it.
 *
 * "Today" compares with yesterday — the same elapsed-time span, not a full day
 * the current day has not finished yet. The calendar periods compare with the
 * same dates one period back, which is the comparison a shopkeeper expects
 * from "this month versus last month so far".
 */
export function resolvePeriodPair(
  id: PulsePeriodId,
  now: Date,
  custom?: { from: Date; to: Date },
): PeriodPair {
  const current =
    id === "custom"
      ? custom
        ? {
            id: "custom" as const,
            from: startOfDay(custom.from),
            // Inclusive end-of-day selection, exclusive query bound.
            to: new Date(startOfDay(custom.to).getTime() + DAY_MS),
            label: `${formatDay(custom.from)} – ${formatDay(custom.to)}`,
          }
        : // A custom period with no range yet: the sensible default, never a
          // zero-width window that would silently return empty figures.
          preset("30d", now)
      : preset(id, now);

  const span = current.to.getTime() - current.from.getTime();
  const previous: PulsePeriod = {
    id: current.id,
    from: new Date(current.from.getTime() - span),
    to: current.from,
    label:
      id === "today"
        ? "Yesterday"
        : id === "month"
          ? "Previous month to date"
          : `Previous ${calendarDays(current.from, current.to)} days`,
  };

  return { current, previous, fetchFrom: previous.from };
}

function formatDay(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

/** Maps the database's aggregate onto Pulse's named fields. Same source as Reports. */
export function overviewFromReport(report: ShopReport): PulseOverview {
  const netSales = report.grossSales - report.refunds;
  const estGrossProfit = report.grossSales - report.costOfGoods;
  return {
    grossSales: report.grossSales,
    netSales,
    estGrossProfit,
    expenses: report.expenses,
    netResult: estGrossProfit - report.expenses,
    salesCount: report.salesCount,
    avgTransaction: report.salesCount > 0 ? report.grossSales / report.salesCount : null,
    stockValue: report.stockValue,
    outstandingCredit: report.outstandingCredit,
    restockCount: report.lowStockCount,
    collected: report.collected,
    debtCollected: report.debtCollected,
    refunds: report.refunds,
    discounts: report.discounts,
  };
}

/**
 * The change between two equivalent windows.
 *
 * When the previous window was zero the percentage is honestly null rather
 * than infinity or a invented 100%: "up from nothing" is a sentence, not a
 * percentage.
 */
export function delta(current: number, previous: number): MetricDelta {
  return {
    current,
    previous,
    abs: current - previous,
    pct: previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100,
  };
}

/** Splits one fetched span into the current and previous windows, by sale time. */
export function sliceLines(raw: SaleLine[], period: PulsePeriod): SaleLine[] {
  const from = period.from.getTime();
  const to = period.to.getTime();
  return raw.filter((line) => {
    const at = new Date(line.soldAt).getTime();
    return at >= from && at < to;
  });
}

/**
 * Per-product totals for one window. Lines without a product id (deleted
 * products) keep their recorded name so their revenue is never dropped.
 */
export function aggregateProductLines(lines: SaleLine[]): ProductLine[] {
  const byProduct = new Map<string, ProductLine>();
  for (const line of lines) {
    const key = line.productId ?? `name:${line.productName}`;
    const entry = byProduct.get(key) ?? {
      productId: line.productId,
      name: line.productName,
      quantity: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
      lines: 0,
    };
    entry.quantity += line.quantity;
    entry.revenue += line.subtotal;
    entry.cost += line.quantity * line.buyingPrice;
    entry.lines += 1;
    byProduct.set(key, entry);
  }
  for (const entry of byProduct.values()) entry.profit = entry.revenue - entry.cost;
  return [...byProduct.values()];
}

/**
 * Calendar-day totals across a window, for the trend strip. Days with no
 * recorded sales are real days with real zero revenue — they are included, so
 * a gap in the chart is a gap in the records, not missing data.
 */
export function dailyTotals(lines: SaleLine[], period: PulsePeriod): DailyTotal[] {
  const totals = new Map<string, DailyTotal>();
  const day = startOfDay(period.from);
  const end = period.to;
  while (day.getTime() <= end.getTime()) {
    totals.set(dayKey(day), { day: dayKey(day), revenue: 0, quantity: 0 });
    day.setTime(day.getTime() + DAY_MS);
  }
  for (const line of lines) {
    const key = dayKey(new Date(line.soldAt));
    const entry = totals.get(key);
    if (!entry) continue; // outside the window; the period label says which days count
    entry.revenue += line.subtotal;
    entry.quantity += line.quantity;
  }
  return [...totals.values()];
}

function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${dayOfMonth}`;
}

/** Expense totals per category across two windows, for the comparison table. */
export function expenseTotalsByCategory(
  current: { category: string; amount: number }[],
  previous: { category: string; amount: number }[],
): { category: string; current: number; previous: number }[] {
  const totals = new Map<string, { category: string; current: number; previous: number }>();
  for (const row of current) {
    const entry = totals.get(row.category) ?? { category: row.category, current: 0, previous: 0 };
    entry.current += row.amount;
    totals.set(row.category, entry);
  }
  for (const row of previous) {
    const entry = totals.get(row.category) ?? { category: row.category, current: 0, previous: 0 };
    entry.previous += row.amount;
    totals.set(row.category, entry);
  }
  return [...totals.values()].sort((a, b) => b.current - a.current);
}

/**
 * Products whose recorded sales moved sharply between the two windows.
 *
 * Both directions are reported, and only products with enough previous volume
 * to make "declining" mean something: a product that sold once last week and
 * zero times this week is noise, not a trend.
 */
export function movers(
  currentLines: ProductLine[],
  previousLines: ProductLine[],
  minPreviousQuantity = 5,
): {
  rising: (ProductLine & { previousQuantity: number })[];
  falling: (ProductLine & { previousQuantity: number })[];
} {
  const previousByProduct = new Map(
    previousLines.filter((line) => line.productId).map((line) => [line.productId, line]),
  );
  const rising: (ProductLine & { previousQuantity: number })[] = [];
  const falling: (ProductLine & { previousQuantity: number })[] = [];

  for (const current of currentLines) {
    if (!current.productId) continue;
    const previous = previousByProduct.get(current.productId);
    if (!previous || previous.quantity < minPreviousQuantity) continue;
    const change = current.quantity - previous.quantity;
    if (change === 0) continue;
    if (change > 0 && change >= previous.quantity * 0.3) {
      rising.push({ ...current, previousQuantity: previous.quantity });
    } else if (change < 0 && current.quantity <= previous.quantity * 0.6) {
      falling.push({ ...current, previousQuantity: previous.quantity });
    }
  }

  rising.sort((a, b) => b.quantity - a.quantity);
  falling.sort((a, b) => a.quantity - b.quantity);
  return { rising: rising.slice(0, 5), falling: falling.slice(0, 5) };
}
