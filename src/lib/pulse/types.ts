/**
 * Pith Pulse — shared shapes.
 *
 * Every type here describes something computed from the shop's own recorded
 * rows. Nothing in Pulse is generated, scored or guessed: the engine is a set
 * of ordinary calculations over the same records the Reports screen reads, and
 * every figure it produces names the window and the rows it came from.
 */

/** The selectable reporting periods. `custom` carries its own explicit range. */
export type PulsePeriodId = "today" | "7d" | "30d" | "month" | "custom";

export interface PulsePeriod {
  id: PulsePeriodId;
  /** Inclusive start (local midnight for the calendar periods). */
  from: Date;
  /** Exclusive end — the queries use `sold_at < to`, exactly like Reports. */
  to: Date;
  /** Human label for the window, e.g. "Last 7 days". */
  label: string;
}

/** The selected window plus the equally long window that immediately precedes it. */
export interface PeriodPair {
  current: PulsePeriod;
  previous: PulsePeriod;
  /**
   * The inclusive start of everything that must be fetched to serve both
   * windows plus the forecast observation window: one query spans it all.
   */
  fetchFrom: Date;
}

/**
 * The headline numbers, in the shop's own currency units.
 *
 * These map one-to-one onto `shop_report` (the owner-only PostgreSQL function
 * the Reports screen also uses) so Pulse and Reports can never disagree.
 */
export interface PulseOverview {
  /** Sum of `sales.total_amount` over completed and recorded sales in the window. */
  grossSales: number;
  /** Gross sales less refunds recorded (not rejected) in the window. */
  netSales: number;
  /** Gross sales less the recorded buying cost of the goods sold. Estimate. */
  estGrossProfit: number;
  /** Sum of `expenses.amount` in the window. */
  expenses: number;
  /** Estimated gross profit less recorded expenses. Known costs only. */
  netResult: number;
  /** Number of sale rows in the window. */
  salesCount: number;
  /** Gross sales ÷ sales count; null when there were no sales. */
  avgTransaction: number | null;
  /** Stock at recorded buying price (a snapshot, not a window figure). */
  stockValue: number;
  /** Total debtor balances owed right now (a snapshot, not a window figure). */
  outstandingCredit: number;
  /** Active products at or below their low-stock threshold right now. */
  restockCount: number;
  /** Payments recorded in the window — what actually came in, credit excluded. */
  collected: number;
  /** Debtor repayments recorded in the window. */
  debtCollected: number;
  /** Refunds recorded (not rejected) in the window. */
  refunds: number;
  /** Sale-level discounts applied in the window. */
  discounts: number;
}

/** A change between two equivalent windows. `pct` is null when the previous window was zero. */
export interface MetricDelta {
  current: number;
  previous: number;
  abs: number;
  pct: number | null;
}

/** One product's recorded sales inside one window. */
export interface ProductLine {
  /** Null only for historical rows whose product has since been deleted. */
  productId: string | null;
  name: string;
  quantity: number;
  /** Line revenue: the recorded `subtotal` of the sale item. */
  revenue: number;
  /** Recorded buying cost of those units: `quantity × buying_price`. */
  cost: number;
  /** Revenue less cost. An estimate: it uses the recorded buying price. */
  profit: number;
  /** How many separate sale lines produced these totals. */
  lines: number;
}

/** One calendar day's recorded sales, for the trend strip. */
export interface DailyTotal {
  /** Local calendar day, `YYYY-MM-DD`. */
  day: string;
  revenue: number;
  quantity: number;
}

/** The four restock categories, each reachable only by the rules in `forecast.ts`. */
export type ForecastBucket = "urgent" | "soon" | "sufficient" | "insufficient";

/** How much the engine trusts a number. Never a fake percentage. */
export type Confidence = "high" | "moderate" | "low" | "insufficient";

export interface ForecastRow {
  productId: string;
  name: string;
  unit: string;
  /** What is on the shelf now (`products.quantity`). */
  stock: number;
  /** Recorded reorder threshold (`products.low_stock_threshold`). */
  threshold: number;
  /** Units sold inside the observation window. */
  unitsSold: number;
  /** Units ÷ observed calendar days. Null when no demand was recorded. */
  avgDailyDemand: number | null;
  /** Shelf ÷ daily demand, rounded up. Null when demand is zero or unreliable. */
  daysRemaining: number | null;
  /**
   * Suggested reorder quantity, or null when the inputs do not support one.
   * Built from the demand estimate, a stated cover target and the threshold —
   * never from an invented supplier lead time.
   */
  suggestQty: number | null;
  bucket: ForecastBucket;
  confidence: Confidence;
  /** Plain-language reasons behind the bucket and the suggestion. */
  reasons: string[];
  /** Calendar days actually observed (shop history may start mid-window). */
  observedDays: number;
  /** Days inside the window on which the shop recorded any sale at all. */
  activeDays: number;
}

export type InsightSeverity = "info" | "attention" | "urgent";

export interface Insight {
  /** Stable identity: the same unchanged fact keeps the same id across refreshes. */
  id: string;
  type:
    | "stockout_risk"
    | "sales_change"
    | "profit_change"
    | "expense_change"
    | "declining_product"
    | "no_recent_sales"
    | "missing_cost_data"
    | "credit_outstanding"
    | "thin_history";
  title: string;
  /** Plain-language explanation, including the numbers it is based on. */
  body: string;
  severity: InsightSeverity;
  confidence: Confidence;
  /** The observation window or comparison window behind the statement. */
  window: { fromIso: string; toIso: string; label: string };
  /** The supporting values, for the "show me the figures" disclosure. */
  evidence: { label: string; value: string }[];
  /** When this insight was calculated. */
  computedAtIso: string;
  /** An optional next step, always leading into an existing Pith workflow. */
  action?: {
    label: string;
    to: "/app/inventory" | "/app/restock" | "/app/debtors" | "/app/expenses";
  };
}

/** One supported Ask Pulse answer, built only from already-computed context. */
export interface AskAnswer {
  /** The intent actually matched, for tests and logging. */
  intent: string;
  title: string;
  lines: { label: string; value: string }[];
  /** Any caveat the answer must carry (missing costs, sparse history…). */
  note?: string;
  /** The existing screen the figures come from or lead to. */
  to?:
    | "/app/inventory"
    | "/app/transactions"
    | "/app/expenses"
    | "/app/debtors"
    | "/app/restock"
    | "/app/reports";
}

/** Everything Ask Pulse is allowed to reason over. No queries, no raw SQL. */
export interface AskContext {
  currency: string;
  periodLabel: string;
  current: PulseOverview;
  previous: PulseOverview;
  productLines: ProductLine[];
  previousLines: ProductLine[];
  forecasts: ForecastRow[];
  expenseByCategory: { category: string; current: number; previous: number }[];
  /** True when the window holds so few sales that per-product answers mislead. */
  thinHistory: boolean;
}
