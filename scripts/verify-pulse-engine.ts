/**
 * SAVO Pulse — calculation-engine verification.
 *
 * Exercises the pure engine in `src/lib/pulse/*` directly: periods and
 * comparisons, metric aggregation, the restock forecast, the deterministic
 * insight rules and the bounded Ask Pulse parser. No database, no browser, no
 * mocks — just arithmetic and rules, checked against hand-computed expected
 * values, including the edge cases the brief names: empty shops, zero
 * baselines, refunds/discounts, missing costs, zero demand, irregular history
 * and unsupported questions.
 *
 * Run: bun scripts/verify-pulse-engine.ts
 * Exits non-zero if any expectation fails.
 */
import {
  aggregateProductLines,
  dailyTotals,
  delta,
  expenseTotalsByCategory,
  movers,
  overviewFromReport,
  resolvePeriodPair,
  sliceLines,
  type SaleLine,
} from "@/lib/pulse/metrics";
import { buildForecasts, COVER_DAYS, type ForecastProduct } from "@/lib/pulse/forecast";
import { buildInsights, type InsightInput } from "@/lib/pulse/insights";
import { answerAsk, matchAskIntent, ASK_EXAMPLES } from "@/lib/pulse/ask";
import type { AskContext, ProductLine } from "@/lib/pulse/types";
import type { ShopReport } from "@/services/reports.service";

const results: { name: string; ok: boolean }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` — ${detail}`}`);
}

/** A fixed instant keeps every expectation exact regardless of when this runs. */
const NOW = new Date(2026, 9, 15, 12, 0, 0); // 15 Oct 2026, midday, local time
const DAY = 24 * 60 * 60 * 1000;

/* ============================================================ 1. periods */

{
  const pair = resolvePeriodPair("today", NOW);
  check(
    "today starts at local midnight and ends now",
    pair.current.from.getTime() === new Date(2026, 9, 15, 0, 0, 0).getTime() &&
      pair.current.to.getTime() === NOW.getTime(),
    `${pair.current.from.toISOString()} → ${pair.current.to.toISOString()}`,
  );
  check(
    "today's comparison is the same elapsed span of yesterday",
    pair.previous.to.getTime() === pair.current.from.getTime() &&
      pair.previous.from.getTime() ===
        pair.current.from.getTime() - (NOW.getTime() - new Date(2026, 9, 15, 0, 0, 0).getTime()),
    pair.previous.label,
  );
  check("today's label is Yesterday", pair.previous.label === "Yesterday", pair.previous.label);
  check(
    "fetchFrom starts at the previous window",
    pair.fetchFrom.getTime() === pair.previous.from.getTime(),
  );
}

{
  const pair = resolvePeriodPair("7d", NOW);
  check(
    "7 days spans midnight six days back",
    pair.current.from.getTime() === new Date(2026, 9, 9, 0, 0, 0).getTime(),
    pair.current.from.toISOString(),
  );
  check(
    "previous 7 days is an equal-length window ending at the current start",
    pair.previous.to.getTime() === pair.current.from.getTime() &&
      pair.previous.from.getTime() ===
        pair.current.from.getTime() - (NOW.getTime() - pair.current.from.getTime()),
    pair.previous.label,
  );
  check(
    "7-day comparison label counts seven days",
    pair.previous.label === "Previous 7 days",
    pair.previous.label,
  );
}

{
  const pair = resolvePeriodPair("month", NOW);
  check(
    "this month starts on the 1st",
    pair.current.from.getTime() === new Date(2026, 9, 1, 0, 0, 0).getTime(),
    pair.current.from.toISOString(),
  );
  check(
    "month comparison label is previous-month-to-date",
    pair.previous.label === "Previous month to date",
    pair.previous.label,
  );
}

{
  const pair = resolvePeriodPair("custom", NOW, {
    from: new Date(2026, 9, 10),
    to: new Date(2026, 9, 12),
  });
  check(
    "custom range is inclusive of its end date",
    pair.current.to.getTime() === new Date(2026, 9, 13, 0, 0, 0).getTime(),
    pair.current.to.toISOString(),
  );
  check(
    "custom comparison is the same number of days immediately before",
    pair.previous.from.getTime() === new Date(2026, 9, 7).getTime() &&
      pair.previous.to.getTime() === pair.current.from.getTime(),
    pair.previous.label,
  );
  const fallback = resolvePeriodPair("custom", NOW);
  check(
    "custom with no range falls back to a real window, never a zero-width one",
    fallback.current.id === "30d" && fallback.current.to > fallback.current.from,
    fallback.current.id,
  );
}

/* ============================================================ 2. deltas */

check(
  "delta computes a percentage change",
  delta(150, 100).pct === 50,
  String(delta(150, 100).pct),
);
check("delta with a zero baseline reports null, not infinity", delta(100, 0).pct === null);
check("delta handles a fall", delta(50, 100).pct === -50 && delta(50, 100).abs === -50);
check(
  "delta against a negative baseline uses the magnitude",
  delta(-50, -100).pct === 50,
  String(delta(-50, -100).pct),
);

/* ================================================= 3. overview mapping */

const baseReport: ShopReport = {
  salesCount: 10,
  grossSales: 1000,
  discounts: 50,
  collected: 800,
  debtCollected: 100,
  refunds: 20,
  expenses: 150,
  costOfGoods: 600,
  outstandingCredit: 400,
  stockValue: 2000,
  lowStockCount: 3,
  topProducts: [],
};

{
  const view = overviewFromReport(baseReport);
  check(
    "net sales subtracts refunds only (discounts are already inside totals)",
    view.netSales === 980,
    String(view.netSales),
  );
  check(
    "estimated gross profit is sales less recorded cost",
    view.estGrossProfit === 400,
    String(view.estGrossProfit),
  );
  check(
    "net result is estimated profit less recorded expenses",
    view.netResult === 250,
    String(view.netResult),
  );
  check(
    "average transaction divides gross by count",
    view.avgTransaction === 100,
    String(view.avgTransaction),
  );
  check("restock count maps from low-stock count", view.restockCount === 3);
  const empty = overviewFromReport({ ...baseReport, salesCount: 0, grossSales: 0 });
  check("an empty shop has a null average, not NaN", empty.avgTransaction === null);
}

/* ================================================ 4. line aggregation */

const lines: SaleLine[] = [
  {
    soldAt: new Date(2026, 9, 14, 9, 0, 0).toISOString(),
    productId: "p1",
    productName: "Sugar 1kg",
    quantity: 2,
    subtotal: 400,
    buyingPrice: 150,
  },
  {
    soldAt: new Date(2026, 9, 14, 11, 0, 0).toISOString(),
    productId: "p1",
    productName: "Sugar 1kg",
    quantity: 1,
    subtotal: 200,
    buyingPrice: 150,
  },
  {
    soldAt: new Date(2026, 9, 15, 8, 0, 0).toISOString(),
    productId: "p2",
    productName: "Unga 2kg",
    quantity: 3,
    subtotal: 600,
    buyingPrice: 170,
  },
  {
    soldAt: new Date(2026, 9, 15, 9, 0, 0).toISOString(),
    productId: null,
    productName: "Removed product",
    quantity: 1,
    subtotal: 90,
    buyingPrice: 40,
  },
];

{
  const period = {
    id: "7d" as const,
    from: new Date(2026, 9, 14, 0, 0, 0),
    to: new Date(2026, 9, 15, 12, 0, 0),
    label: "x",
  };
  const sliced = sliceLines(lines, period);
  check(
    "slice includes the window start and excludes anything after `to`",
    sliced.length === 4,
    String(sliced.length),
  );
  const before = sliceLines(lines, { ...period, from: new Date(2026, 9, 15, 0, 0, 0) });
  check("slice filters by sale time", before.length === 2, String(before.length));

  const aggregated = aggregateProductLines(sliced);
  const sugar = aggregated.find((row) => row.productId === "p1");
  check(
    "same product lines aggregate",
    sugar?.quantity === 3 && sugar.revenue === 600 && sugar.lines === 2,
  );
  check(
    "line profit is revenue less recorded buying cost",
    sugar?.profit === 600 - 3 * 150,
    String(sugar?.profit),
  );
  const orphan = aggregated.find((row) => row.productId === null);
  check("lines of deleted products keep their recorded revenue", orphan?.revenue === 90);
}

{
  const period = {
    id: "7d" as const,
    from: new Date(2026, 9, 14, 0, 0, 0),
    to: new Date(2026, 9, 15, 12, 0, 0),
    label: "x",
  };
  const days = dailyTotals(sliceLines(lines, period), period);
  check(
    "daily totals include every calendar day of the window",
    days.length === 2,
    String(days.length),
  );
  check(
    "a day with no sales is a real zero, not a gap",
    days[0].revenue === 600 && days[0].day === "2026-10-14",
    JSON.stringify(days[0]),
  );
  check("totals sum the day's lines", days[1].revenue === 690, String(days[1].revenue));
}

check(
  "expense totals merge categories across windows and sort by current spend",
  expenseTotalsByCategory(
    [
      { category: "rent", amount: 50 },
      { category: "transport", amount: 30 },
    ],
    [{ category: "rent", amount: 20 }],
  )
    .map((row) => row.category)
    .join(",") === "rent,transport",
);

{
  const current: ProductLine[] = [
    { productId: "a", name: "A", quantity: 14, revenue: 0, cost: 0, profit: 0, lines: 6 },
    { productId: "b", name: "B", quantity: 5, revenue: 0, cost: 0, profit: 0, lines: 4 },
    { productId: "c", name: "C", quantity: 4, revenue: 0, cost: 0, profit: 0, lines: 3 },
  ];
  const previous: ProductLine[] = [
    { productId: "a", name: "A", quantity: 10, revenue: 0, cost: 0, profit: 0, lines: 5 },
    { productId: "b", name: "B", quantity: 10, revenue: 0, cost: 0, profit: 0, lines: 8 },
    { productId: "c", name: "C", quantity: 10, revenue: 0, cost: 0, profit: 0, lines: 6 },
  ];
  const moved = movers(current, previous);
  check(
    "movers reports a product up at least 30% on its previous volume",
    moved.rising.map((r) => r.name).join(",") === "A",
  );
  check(
    "movers reports a product down to 60% or less",
    moved.falling.map((r) => r.name).join(",") === "C,B",
    moved.falling.map((r) => r.name).join(","),
  );
  check(
    "movers carries both quantities for the explanation",
    moved.rising[0]?.previousQuantity === 10 && moved.rising[0]?.quantity === 14,
  );
  const tooSmall = movers(current, [
    { productId: "b", name: "B", quantity: 4, revenue: 0, cost: 0, profit: 0, lines: 4 },
  ]);
  check(
    "movers ignores noise below five previous units",
    tooSmall.falling.length === 0 && tooSmall.rising.length === 0,
  );
}

/* ================================================= 5. restock forecast */

function product(over: Partial<ForecastProduct> & { id: string; stock: number }): ForecastProduct {
  return {
    name: over.id,
    unit: "pc",
    threshold: 5,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

function dailyLines(productId: string, days: number, quantityPerDay: number): SaleLine[] {
  const out: SaleLine[] = [];
  for (let i = 0; i < days; i += 1) {
    const day = new Date(NOW.getTime() - i * DAY);
    for (let q = 0; q < quantityPerDay; q += 1) {
      out.push({
        soldAt: day.toISOString(),
        productId,
        productName: productId,
        quantity: 1,
        subtotal: 100,
        buyingPrice: 40,
      });
    }
  }
  return out;
}

{
  const steady = dailyLines("a", 14, 1);
  const rows = buildForecasts({
    products: [
      product({ id: "a", stock: 10 }),
      product({ id: "b", stock: 2 }),
      product({ id: "c", stock: 2 }),
      product({ id: "d", stock: 10, createdAt: new Date(NOW.getTime() - 3 * DAY).toISOString() }),
    ],
    windowLines: [...steady, ...dailyLines("c", 14, 1), ...dailyLines("d", 3, 2)],
    now: NOW,
    activeDays: 14,
    firstSaleAt: "2026-01-01T00:00:00.000Z",
  });
  const byId = new Map(rows.map((row) => [row.productId, row]));

  const a = byId.get("a");
  check(
    "steady demand: units over observed days",
    a?.unitsSold === 14 && a?.avgDailyDemand === 1,
    `${a?.unitsSold}/${a?.observedDays}`,
  );
  check(
    "days remaining is stock divided by daily demand",
    a?.daysRemaining === 10,
    String(a?.daysRemaining),
  );
  check(
    "a product with more than a week of stock appears sufficient",
    a?.bucket === "sufficient",
    a?.bucket,
  );
  check("confidence is high on fourteen active days", a?.confidence === "high", a?.confidence);
  check(
    `suggestion covers ${COVER_DAYS} days of demand on top of the shelf`,
    a?.suggestQty === 4, // ceil(1 unit/day × 14 days − 10 in stock) = 4
    String(a?.suggestQty),
  );

  const b = byId.get("b");
  check(
    "zero demand yields a null rate, never a division by zero",
    b?.avgDailyDemand === null && b?.daysRemaining === null,
  );
  check(
    "zero demand on low stock is flagged for review, not invented",
    b?.bucket === "soon",
    b?.bucket,
  );
  check(
    "zero demand with low stock still suggests reaching the threshold",
    b?.suggestQty === 4,
    String(b?.suggestQty),
  );
  check(
    "zero demand is honestly classified as insufficient data",
    b?.confidence === "insufficient",
  );

  const c = byId.get("c");
  check(
    "fast-moving low stock is urgent",
    c?.bucket === "urgent" && c?.daysRemaining === 2,
    `${c?.bucket}/${c?.daysRemaining}`,
  );

  const d = byId.get("d");
  check(
    "a product created mid-window observes only its own days",
    d !== undefined && d.observedDays <= 4,
    String(d?.observedDays),
  );
  check(
    "a young product with thin history is not prescribed a quantity",
    d?.confidence === "insufficient" && d?.suggestQty === null,
    `${d?.confidence}/${d?.suggestQty}`,
  );

  const youngShop = buildForecasts({
    products: [product({ id: "a", stock: 10 })],
    windowLines: dailyLines("a", 2, 3),
    now: NOW,
    activeDays: 2,
    firstSaleAt: new Date(NOW.getTime() - 2 * DAY).toISOString(),
  });
  check(
    "a shop younger than the window is judged only on days it existed",
    youngShop[0]?.observedDays === 2,
    String(youngShop[0]?.observedDays),
  );
  check(
    "too little history cannot support a forecast",
    youngShop[0]?.confidence === "insufficient" && youngShop[0]?.suggestQty === null,
  );

  const enough = buildForecasts({
    products: [product({ id: "a", stock: 100 })],
    windowLines: dailyLines("a", 14, 1),
    now: NOW,
    activeDays: 14,
    firstSaleAt: "2026-01-01T00:00:00.000Z",
  });
  check(
    "well-stocked products get no suggested order",
    enough[0]?.suggestQty === null,
    String(enough[0]?.suggestQty),
  );
  check(
    "every forecast row carries readable reasons",
    rows.every(
      (row) => row.reasons.length >= 2 && row.reasons.every((reason) => reason.length > 3),
    ),
  );
}

/* ================================================== 6. insight rules */

function insightFixture(over: Partial<InsightInput> = {}): InsightInput {
  const pair = resolvePeriodPair("7d", NOW);
  return {
    currency: "KES",
    pair,
    current: {
      grossSales: 2000,
      netSales: 1980,
      estGrossProfit: 700,
      expenses: 300,
      netResult: 400,
      salesCount: 10,
      avgTransaction: 200,
      stockValue: 5000,
      outstandingCredit: 0,
      restockCount: 0,
      collected: 1700,
      debtCollected: 100,
      refunds: 20,
      discounts: 50,
    },
    previous: {
      grossSales: 1000,
      netSales: 1000,
      estGrossProfit: 350,
      expenses: 250,
      netResult: 100,
      salesCount: 5,
      avgTransaction: 200,
      stockValue: 5000,
      outstandingCredit: 0,
      restockCount: 0,
      collected: 900,
      debtCollected: 50,
      refunds: 0,
      discounts: 0,
    },
    currentLines: [],
    previousLines: [],
    forecasts: [],
    expenseByCategory: [],
    productsMissingCosts: [],
    productsNoSales: [],
    computedAt: NOW,
    ...over,
  };
}

{
  const insights = buildInsights(insightFixture());
  const sales = insights.find((insight) => insight.type === "sales_change");
  check(
    "a doubled sales window is reported as a change",
    sales !== undefined && sales.title.includes("100%"),
    sales?.title,
  );
  check(
    "sales change carries both windows as evidence",
    sales?.evidence.length === 3,
    String(sales?.evidence.length),
  );
  const profit = insights.find((insight) => insight.type === "profit_change");
  check(
    "a materially moved profit figure is reported",
    profit !== undefined && profit.title.includes("100%"),
    profit?.title,
  );
  check(
    "profit text never calls an estimate net profit",
    insights.every((insight) => !insight.body.toLowerCase().includes("net profit")),
  );
}

{
  const thin = buildInsights(
    insightFixture({ current: { ...insightFixture().current, salesCount: 2 } }),
  );
  check(
    "a window with two sales admits it is thin",
    thin.some((insight) => insight.type === "thin_history"),
  );
  check(
    "thin history is marked insufficient, not guessed",
    thin.find((i) => i.type === "thin_history")?.confidence === "insufficient",
  );
}

{
  const flat = insightFixture();
  flat.current = { ...flat.current, grossSales: 500, salesCount: 4 };
  flat.previous = { ...flat.previous, grossSales: 500, salesCount: 4 };
  const insights = buildInsights(flat);
  check(
    "no change means no sales-change insight",
    !insights.some((insight) => insight.type === "sales_change"),
  );
}

{
  const credits = buildInsights(
    insightFixture({ current: { ...insightFixture().current, outstandingCredit: 400 } }),
  );
  const credit = credits.find((insight) => insight.type === "credit_outstanding");
  check(
    "outstanding credit is surfaced with a link, never an auto-reminder",
    credit !== undefined && credit.action?.to === "/app/debtors",
  );
  check("the credit insight has a stable id for dismissal", credit?.id === "credit_outstanding");
  check(
    "no insight tells the user a customer is late",
    credits.every((i) => !/late|unreliable/i.test(i.body)),
  );
}

{
  const expenses = buildInsights(
    insightFixture({ expenseByCategory: [{ category: "rent", current: 50, previous: 30 }] }),
  );
  const rent = expenses.find((insight) => insight.type === "expense_change");
  check(
    "an expense category up two-thirds is surfaced",
    rent !== undefined && rent.title.includes("67%"),
    rent?.title,
  );
  const fresh = buildInsights(
    insightFixture({ expenseByCategory: [{ category: "rent", current: 50, previous: 0 }] }),
  );
  check(
    "an expense with no baseline is not called an increase",
    !fresh.some((insight) => insight.type === "expense_change"),
  );
}

{
  const missing = buildInsights(
    insightFixture({ productsMissingCosts: ["Sukuma Wiki", "Maize Flour"] }),
  );
  const gap = missing.find((insight) => insight.type === "missing_cost_data");
  check(
    "missing buying prices are reported with the affected names",
    gap !== undefined && gap.body.includes("Sukuma Wiki"),
  );
  check("missing-cost insight points at inventory", gap?.action?.to === "/app/inventory");
}

{
  const declined = buildInsights(
    insightFixture({
      currentLines: [
        {
          productId: "p1",
          name: "Blue Band",
          quantity: 4,
          revenue: 400,
          cost: 300,
          profit: 100,
          lines: 3,
        },
      ],
      previousLines: [
        {
          productId: "p1",
          name: "Blue Band",
          quantity: 10,
          revenue: 1000,
          cost: 750,
          profit: 250,
          lines: 8,
        },
      ],
    }),
  );
  check(
    "a product down to 40% of its previous volume is flagged",
    declined.some((insight) => insight.type === "declining_product"),
  );
}

{
  const idle = buildInsights(
    insightFixture({
      productsNoSales: [{ name: "Old Cooking Oil", stockValue: 1200 }],
      current: { ...insightFixture().current, grossSales: 900, salesCount: 8 },
      previous: { ...insightFixture().previous, grossSales: 900, salesCount: 8 },
    }),
  );
  check(
    "an in-stock product with no sales this window is surfaced",
    idle.some((insight) => insight.type === "no_recent_sales"),
  );
}

{
  const fixture = insightFixture({
    forecasts: [
      {
        productId: "p9",
        name: "Dettol 250ml",
        unit: "pc",
        stock: 2,
        threshold: 5,
        unitsSold: 14,
        avgDailyDemand: 1,
        daysRemaining: 2,
        suggestQty: 12,
        bucket: "urgent",
        confidence: "high",
        reasons: ["Sold 14 over the observed window.", "On the shelf: 2."],
        observedDays: 14,
        activeDays: 14,
      },
    ],
  });
  const insights = buildInsights(fixture);
  check(
    "an urgent forecast becomes an urgent insight",
    insights[0]?.severity === "urgent" && insights[0]?.type === "stockout_risk",
    insights[0]?.type,
  );
  check(
    "the stockout insight links to receiving stock",
    insights[0]?.action?.to === "/app/restock",
  );
  const again = buildInsights(fixture);
  check(
    "the engine is deterministic: same input, same ids, same order",
    insights.map((i) => i.id).join("|") === again.map((i) => i.id).join("|"),
  );
  check(
    "every insight names its window and computed time",
    insights.every((i) => Boolean(i.window.fromIso) && Boolean(i.computedAtIso)),
  );
}

/* ==================================================== 7. Ask Pulse */

check(
  "a revenue question maps to the revenue intent",
  matchAskIntent("Which products generated the most revenue this week?") === "top_revenue",
);
check(
  "a restocking question maps to the restock intent",
  matchAskIntent("Which products may need restocking?") === "restock",
);
check(
  "an expenses question maps to the expenses intent",
  matchAskIntent("How did recorded expenses change this month?") === "expenses_change",
);
check(
  "a profit question maps to the profit intent",
  matchAskIntent("What explains the change in recorded gross profit?") === "profit_change",
);
check(
  "a history question maps to the history intent",
  matchAskIntent("Which products have insufficient sales history?") === "insufficient_history",
);
check(
  "reorder phrasing maps to restock",
  matchAskIntent("What should I reorder this week?") === "restock",
);
check(
  "an unrelated question maps to nothing",
  matchAskIntent("What is the weather in Nairobi?") === null,
);
check("SQL-shaped input is not an intent", matchAskIntent("'; DROP TABLE sales; --") === null);
check(
  "every published example question is supported",
  ASK_EXAMPLES.every((example) => matchAskIntent(example) !== null),
);

{
  const askContext: AskContext = {
    currency: "KES",
    periodLabel: "Last 7 days",
    current: overviewFromReport(baseReport) as AskContext["current"],
    previous: overviewFromReport({
      ...baseReport,
      grossSales: 500,
      salesCount: 5,
      expenses: 100,
      costOfGoods: 250,
    }),
    productLines: [
      {
        productId: "p1",
        name: "Sugar 1kg",
        quantity: 10,
        revenue: 2000,
        cost: 1500,
        profit: 500,
        lines: 8,
      },
      {
        productId: "p2",
        name: "Unga 2kg",
        quantity: 4,
        revenue: 800,
        cost: 680,
        profit: 120,
        lines: 4,
      },
    ],
    previousLines: [],
    forecasts: [
      {
        productId: "p1",
        name: "Sugar 1kg",
        unit: "pc",
        stock: 3,
        threshold: 5,
        unitsSold: 14,
        avgDailyDemand: 1,
        daysRemaining: 3,
        suggestQty: 12,
        bucket: "urgent",
        confidence: "high",
        reasons: ["Sold 14 over the observed window."],
        observedDays: 14,
        activeDays: 14,
      },
    ],
    expenseByCategory: [{ category: "rent", current: 50, previous: 30 }],
    thinHistory: false,
  };

  const revenue = answerAsk("Which products generated the most revenue this week?", askContext);
  check(
    "a revenue answer ranks products and states the period",
    revenue?.lines[0]?.label === "Sugar 1kg" && revenue?.lines[0]?.value.includes("2,000"),
    revenue?.lines[0]?.value,
  );
  check("answers link back to the source screen", revenue?.to === "/app/transactions");

  const restock = answerAsk("Which products may need restocking?", askContext);
  check(
    "a restock answer names the flagged product",
    restock?.lines.some((line) => line.label === "Sugar 1kg") === true,
  );
  check(
    "a restock answer states its window and warns about review",
    (restock?.note ?? "").includes("14 days"),
  );

  const expenses = answerAsk("How did recorded expenses change this month?", askContext);
  check(
    "an expenses answer shows both windows and the change",
    expenses !== undefined && expenses.lines.length >= 3,
  );
  check("an expenses answer points at the expenses screen", expenses?.to === "/app/expenses");

  const profit = answerAsk("What explains the change in recorded gross profit?", askContext);
  check(
    "a profit answer decomposes sales, costs and expenses",
    profit !== undefined && profit.lines.some((line) => line.label === "Recorded cost of goods"),
  );

  const history = answerAsk("Which products have insufficient sales history?", askContext);
  check(
    "a history answer reports the counts it based its verdict on",
    history?.lines.some((line) => line.label === "Sales recorded") === true,
  );

  const unsupported = answerAsk("Write me a poem about cows", askContext);
  check("an unsupported question gets no answer, not a fabricated one", unsupported === null);

  const empty = answerAsk("Which products generated the most revenue?", {
    ...askContext,
    productLines: [],
  });
  check(
    "a revenue question on an empty shop says there were no sales",
    empty?.title.includes("No recorded sales") === true,
    empty?.title,
  );
}

/* ------------------------------------------------------------- verdict */

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length > 0) {
  console.log("FAILED:");
  for (const failure of failed) console.log(`  - ${failure.name}`);
  process.exit(1);
}
