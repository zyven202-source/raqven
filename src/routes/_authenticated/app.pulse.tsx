/**
 * SAVO Pulse — "Understand your shop. Know your next move."
 *
 * The owner's business-intelligence screen. Every figure on it comes from the
 * shop's own recorded rows, read through the same owner-only `shop_report`
 * function and the same row-level security as the rest of SAVO — the database
 * refuses an employee here, it is not merely a hidden tab.
 *
 * The screen's contract with the shopkeeper:
 *   - Every number names its window and, where it is an estimate, says so.
 *   - Comparisons are real rows on both sides; a zero baseline shows "up from
 *     nothing", never an invented percentage.
 *   - The radar explains every recommendation and never reorders anything.
 *   - Offline, cached figures carry their load time — nothing pretends to be
 *     live.
 */
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  CalendarRange,
  ChevronRight,
  CircleAlert,
  HandCoins,
  Info,
  PackagePlus,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoticeState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { OwnerOnly } from "@/components/app/OwnerOnly";
import { SectionLabel, StatusBadge, type StatusTone } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useOnlineStatus } from "@/hooks/useServiceWorker";
import { usePulse, type PulseCustomRange } from "@/hooks/usePulse";
import { formatDateTime, formatMoney } from "@/lib/format";
import { delta, MAX_WINDOW_DAYS, movers } from "@/lib/pulse/metrics";
import { answerAsk, ASK_EXAMPLES, ASK_UNSUPPORTED } from "@/lib/pulse/ask";
import { COVER_DAYS } from "@/lib/pulse/forecast";
import type {
  AskAnswer,
  Confidence,
  ForecastBucket,
  ForecastRow,
  Insight,
  MetricDelta,
  PulseOverview,
  PulsePeriodId,
} from "@/lib/pulse/types";

export const Route = createFileRoute("/_authenticated/app/pulse")({
  head: () => ({ meta: [{ title: "SAVO — Pulse" }] }),
  component: () => (
    <OwnerOnly title="SAVO Pulse">
      <PulsePage />
    </OwnerOnly>
  ),
});

const PERIODS: { id: Exclude<PulsePeriodId, "custom">; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "month", label: "This month" },
];

/** Dismissals last a week: the same unchanged fact stays hidden, a new one does not. */
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function dismissKey(shopId: string) {
  return `savo.pulse.dismissed.${shopId}`;
}

function readDismissals(shopId: string): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(dismissKey(shopId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    const fresh: Record<string, number> = {};
    for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof at === "number" && now - at < DISMISS_TTL_MS) fresh[id] = at;
    }
    return fresh;
  } catch {
    return {};
  }
}

function PulsePage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";
  const online = useOnlineStatus();

  const [periodId, setPeriodId] = useState<PulsePeriodId>("30d");
  const [customRange, setCustomRange] = useState<PulseCustomRange | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);

  const pulse = usePulse(shopId, currency, periodId, customRange);

  const [dismissed, setDismissed] = useState<Record<string, number>>({});
  useEffect(() => {
    setDismissed(shopId ? readDismissals(shopId) : {});
  }, [shopId]);

  const visibleInsights = useMemo(
    () => pulse.insights.filter((insight) => dismissed[insight.id] === undefined),
    [pulse.insights, dismissed],
  );

  function dismissInsight(id: string) {
    setDismissed((current) => {
      const next = { ...current, [id]: Date.now() };
      try {
        window.localStorage.setItem(dismissKey(shopId), JSON.stringify(next));
      } catch {
        /* private-mode storage: the dismissal still applies for this session */
      }
      return next;
    });
  }

  function selectCustom(from: string, to: string) {
    if (!from || !to) {
      setCustomRange(null);
      setCustomError(null);
      return;
    }
    const fromDate = new Date(`${from}T00:00:00`);
    const toDate = new Date(`${to}T00:00:00`);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      setCustomError(null);
      return;
    }
    if (fromDate > toDate) {
      setCustomRange(null);
      setCustomError("The start date must be on or before the end date.");
      return;
    }
    const days = (toDate.getTime() - fromDate.getTime()) / (24 * 60 * 60 * 1000) + 1;
    if (days > MAX_WINDOW_DAYS) {
      setCustomRange(null);
      setCustomError(`Choose a range of ${MAX_WINDOW_DAYS} days or less.`);
      return;
    }
    setCustomError(null);
    setCustomRange({ from: fromDate, to: toDate });
  }

  const overview = pulse.currentOverview;

  return (
    <PageContainer>
      <header className="mb-1">
        <PageHeader
          eyebrow="Insight"
          title="SAVO Pulse"
          subtitle="Understand your shop. Know your next move."
        />
      </header>

      {/* ------------------------------------------------------- freshness */}
      <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
        {online ? (
          <>
            <Activity className="size-3" aria-hidden />
            Live figures · updated{" "}
            {pulse.dataUpdatedAt > 0 ? formatDateTime(new Date(pulse.dataUpdatedAt)) : "just now"}
          </>
        ) : (
          <>
            <TriangleAlert className="size-3" aria-hidden />
            {pulse.dataUpdatedAt > 0
              ? `Offline — figures last loaded ${formatDateTime(new Date(pulse.dataUpdatedAt))}, not current.`
              : "Offline — Pulse needs a connection for its first load."}
          </>
        )}
      </p>

      {/* --------------------------------------------------------- periods */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 bg-background/95 px-4 pb-2.5 pt-1 backdrop-blur-md sm:-mx-5 sm:px-5">
        <div className="flex flex-wrap gap-1.5">
          {PERIODS.map((period) => (
            <Button
              key={period.id}
              type="button"
              size="sm"
              variant={periodId === period.id ? "default" : "outline"}
              className="h-9 rounded-full px-3 text-xs"
              aria-pressed={periodId === period.id}
              onClick={() => {
                setPeriodId(period.id);
                setCustomError(null);
              }}
            >
              {period.label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={periodId === "custom" ? "default" : "outline"}
            className="h-9 rounded-full px-3 text-xs"
            aria-pressed={periodId === "custom"}
            onClick={() => setPeriodId("custom")}
          >
            <CalendarRange className="size-3.5" aria-hidden /> Custom
          </Button>
        </div>
        {periodId === "custom" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              type="date"
              aria-label="Custom range start"
              className="h-9 w-[8.5rem] text-xs"
              onChange={(event) =>
                selectCustom(
                  event.target.value,
                  customRange ? toInputDate(customRange.to) : toInputDate(new Date()),
                )
              }
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              aria-label="Custom range end"
              className="h-9 w-[8.5rem] text-xs"
              onChange={(event) =>
                selectCustom(
                  customRange ? toInputDate(customRange.from) : toInputDate(new Date()),
                  event.target.value,
                )
              }
            />
            {customError ? <p className="w-full text-xs text-negative">{customError}</p> : null}
          </div>
        ) : null}
      </div>

      {/* ------------------------------------------------- global states */}
      {pulse.isPending ? (
        <LoadingState label="Reading your records…" />
      ) : pulse.isError ? (
        <ErrorState
          message={pulse.error?.message ?? "Pulse could not read this shop's records."}
          onRetry={pulse.refetch}
          title="Couldn't read your figures"
        />
      ) : overview ? (
        <>
          <OverviewSection
            overview={overview}
            previous={pulse.previousOverview}
            currency={currency}
            pair={pulse.pair}
          />
          <SalesSection
            currency={currency}
            overview={overview}
            lines={pulse.currentLines}
            previousLines={pulse.previousLines}
            trend={pulse.trend}
            thinHistory={pulse.thinHistory}
          />
          <RadarSection forecasts={pulse.forecasts} />
          <MoneySection
            currency={currency}
            overview={overview}
            expenseTotals={pulse.expenseTotals}
          />
          <InsightsSection insights={visibleInsights} onDismiss={dismissInsight} />
          <AskSection askContext={pulse.askContext} thinHistory={pulse.thinHistory} />
        </>
      ) : null}
    </PageContainer>
  );
}

function toInputDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/* --------------------------------------------------------------- overview */

function OverviewSection({
  overview,
  previous,
  currency,
  pair,
}: {
  overview: PulseOverview;
  previous: PulseOverview | null;
  currency: string;
  pair: ReturnType<typeof usePulse>["pair"];
}) {
  const money = (value: number) => formatMoney(value, currency);
  const prev = pair.previous.label.toLowerCase();

  /*
    Only window figures carry a comparison: stock value and outstanding credit
    are snapshots of *right now* — the previous period's report returns the
    same live snapshot, so a delta between them would be a comparison of a
    number with itself. They are labelled as snapshots instead.
  */
  const d = {
    grossSales: previous ? delta(overview.grossSales, previous.grossSales) : null,
    netSales: previous ? delta(overview.netSales, previous.netSales) : null,
    profit: previous ? delta(overview.estGrossProfit, previous.estGrossProfit) : null,
    expenses: previous ? delta(overview.expenses, previous.expenses) : null,
    netResult: previous ? delta(overview.netResult, previous.netResult) : null,
    collected: previous ? delta(overview.collected, previous.collected) : null,
    avg:
      previous && overview.avgTransaction !== null && previous.avgTransaction !== null
        ? delta(overview.avgTransaction, previous.avgTransaction)
        : null,
  };

  return (
    <section className="mb-6">
      <SectionLabel>
        {pair.current.label} <span className="font-normal normal-case">vs {prev}</span>
      </SectionLabel>

      <div className="glass-1 rounded-xl p-4 backdrop-blur-2xl backdrop-saturate-150">
        <p className="tnum text-[2.25rem] font-semibold leading-none">
          {money(overview.grossSales)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          gross sales · {overview.salesCount} sale{overview.salesCount === 1 ? "" : "s"}
          {overview.discounts > 0
            ? ` · ${money(overview.discounts)} of discounts already deducted`
            : ""}
        </p>
        {d.grossSales ? <Delta change={d.grossSales} currency={currency} goodWhenUp /> : null}
      </div>

      <dl className="mt-3 list-divided">
        <MetricLine
          label="Net sales"
          value={money(overview.netSales)}
          note="After refunds recorded in this window"
          delta={d.netSales ?? undefined}
          currency={currency}
        />
        <MetricLine
          label="Estimated gross profit"
          value={money(overview.estGrossProfit)}
          note="Sales less the buying price recorded on each product"
          tone={overview.estGrossProfit < 0 ? "negative" : "default"}
          delta={d.profit ?? undefined}
          currency={currency}
        />
        <MetricLine
          label="Recorded expenses"
          value={money(overview.expenses)}
          note="What was logged in this window"
          delta={d.expenses ?? undefined}
          currency={currency}
          goodWhenUp={false}
        />
        <MetricLine
          label="Net result (known costs)"
          value={money(overview.netResult)}
          note="Estimated profit less recorded expenses — not net profit"
          tone={overview.netResult < 0 ? "negative" : "positive"}
          emphasis
          delta={d.netResult ?? undefined}
          currency={currency}
        />
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
        <Figure
          label="Average sale"
          value={overview.avgTransaction === null ? "—" : money(overview.avgTransaction)}
          note="Gross sales ÷ sales count"
          delta={d.avg ?? undefined}
          currency={currency}
        />
        <Figure
          label="Cash & mobile money in"
          value={money(overview.collected)}
          note="Payments recorded; credit excluded"
          delta={d.collected ?? undefined}
          currency={currency}
        />
        <Figure
          label="Debt repaid"
          value={money(overview.debtCollected)}
          note="Repayments in this window"
        />
        <Figure
          label="Refunds recorded"
          value={money(overview.refunds)}
          note="Not rejected refunds"
        />
        <Figure
          label="Stock at cost"
          value={money(overview.stockValue)}
          note="Buying price × quantity, active products"
        />
        <Figure
          label="Owed to the shop"
          value={money(overview.outstandingCredit)}
          note="All debtor balances now"
        />
        <Figure
          label="Running low"
          value={String(overview.restockCount)}
          note="At or below reorder threshold"
        />
        <Figure
          label="Sales count"
          value={String(overview.salesCount)}
          note="Recorded sales in the window"
        />
      </div>
    </section>
  );
}

function MetricLine({
  label,
  value,
  note,
  tone = "default",
  emphasis = false,
  delta,
  currency,
  goodWhenUp = true,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "positive" | "negative";
  emphasis?: boolean;
  delta?: MetricDelta | undefined;
  currency?: string | undefined;
  goodWhenUp?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className={emphasis ? "text-sm font-semibold" : "text-sm"}>{label}</p>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{note}</p>
        {delta && currency ? (
          <Delta change={delta} currency={currency} goodWhenUp={goodWhenUp} />
        ) : null}
      </div>
      <p
        className={
          "tnum shrink-0 text-right " +
          (emphasis ? "text-base font-semibold " : "text-sm ") +
          (tone === "positive" ? "text-positive " : tone === "negative" ? "text-negative " : "")
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
  delta,
  currency,
  goodWhenUp = true,
}: {
  label: string;
  value: string;
  note: string;
  delta?: MetricDelta | undefined;
  currency?: string | undefined;
  goodWhenUp?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tnum mt-0.5 text-base font-semibold">{value}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{note}</p>
      {delta && currency ? (
        <Delta change={delta} currency={currency} goodWhenUp={goodWhenUp} />
      ) : null}
    </div>
  );
}

function Delta({
  change,
  currency,
  goodWhenUp,
}: {
  change: MetricDelta;
  currency: string;
  goodWhenUp: boolean;
}) {
  if (change.current === 0 && change.previous === 0) return null;
  const up = change.abs > 0;
  const flat = change.abs === 0;
  const tone =
    flat || change.abs === 0
      ? "text-muted-foreground"
      : (up && goodWhenUp) || (!up && !goodWhenUp)
        ? "text-positive"
        : "text-negative";
  const pct = change.pct === null ? null : Math.round(Math.abs(change.pct));
  const text = flat
    ? "level with previous"
    : pct === null
      ? `${up ? "up" : "down"} from ${formatMoney(change.previous, currency)}`
      : `${up ? "↑" : "↓"} ${pct}% vs previous`;
  return <p className={`mt-0.5 text-[11px] font-medium ${tone}`}>{text}</p>;
}

/* -------------------------------------------------------- sales intelligence */

function SalesSection({
  currency,
  overview,
  lines,
  previousLines,
  trend,
  thinHistory,
}: {
  currency: string;
  overview: PulseOverview;
  lines: ReturnType<typeof usePulse>["currentLines"];
  previousLines: ReturnType<typeof usePulse>["previousLines"];
  trend: { day: string; revenue: number; quantity: number }[];
  thinHistory: boolean;
}) {
  const topRevenue = useMemo(
    () => [...lines].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
    [lines],
  );
  const topProfit = useMemo(
    () =>
      [...lines]
        .filter((line) => line.profit > 0)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 3),
    [lines],
  );
  const topQuantity = useMemo(
    () => [...lines].sort((a, b) => b.quantity - a.quantity).slice(0, 3),
    [lines],
  );
  const maxDay = Math.max(1, ...trend.map((day) => day.revenue));

  if (overview.salesCount === 0) {
    return (
      <section className="mb-6">
        <SectionLabel>Sales intelligence</SectionLabel>
        <EmptyState
          title="No recorded sales in this window"
          description="Pick a longer period, or ring up a sale — Pulse reads what SAVO records and never fills the gaps with guesses."
        />
      </section>
    );
  }

  return (
    <section className="mb-6">
      <SectionLabel>Sales intelligence</SectionLabel>

      {/* Daily takings strip — real days, real zeroes included. */}
      <div
        className="glass-1 mb-3 rounded-xl p-3 backdrop-blur-2xl backdrop-saturate-150"
        role="img"
        aria-label={`Daily recorded sales for the period: ${trend.length} days, highest ${formatMoney(
          maxDay,
          currency,
        )}.`}
      >
        <div className="flex h-16 items-end gap-[2px]">
          {trend.map((day) => (
            <span
              key={day.day}
              title={`${day.day}: ${formatMoney(day.revenue, currency)}`}
              className={
                "min-w-0 flex-1 rounded-sm " + (day.revenue > 0 ? "bg-positive/70" : "bg-sunken")
              }
              style={{
                height: `${Math.max(day.revenue > 0 ? 6 : 2, (day.revenue / maxDay) * 100)}%`,
              }}
            />
          ))}
        </div>
        <p className="mt-2 flex justify-between text-[11px] text-muted-foreground">
          <span>{trend[0]?.day ?? ""}</span>
          <span>{trend[trend.length - 1]?.day ?? ""}</span>
        </p>
      </div>

      {thinHistory ? (
        <NoticeState
          title="A thin window"
          description="This period holds only a few recorded sales, so the rankings below are provisional — a longer period will say more."
        />
      ) : null}

      <TopList
        title="Top by revenue"
        rows={topRevenue.map((line) => ({
          key: line.productId ?? line.name,
          name: line.name,
          primary: formatMoney(line.revenue, currency),
          secondary: `${line.quantity} sold`,
        }))}
      />
      <TopList
        title="Top by estimated profit"
        rows={topProfit.map((line) => ({
          key: line.productId ?? line.name,
          name: line.name,
          primary: formatMoney(line.profit, currency),
          secondary: `${line.quantity} sold · cost recorded`,
        }))}
      />
      <TopList
        title="Top by quantity"
        rows={topQuantity.map((line) => ({
          key: line.productId ?? line.name,
          name: line.name,
          primary: `${line.quantity}`,
          secondary: formatMoney(line.revenue, currency),
        }))}
      />
      <MoversBlock lines={lines} previousLines={previousLines} />
    </section>
  );
}

/** Products whose recorded quantity moved sharply between the two windows. */
function MoversBlock({
  lines,
  previousLines,
}: {
  lines: ReturnType<typeof usePulse>["currentLines"];
  previousLines: ReturnType<typeof usePulse>["previousLines"];
}) {
  const { rising, falling } = useMemo(() => movers(lines, previousLines), [lines, previousLines]);
  if (rising.length === 0 && falling.length === 0) return null;

  const row = (entry: (typeof rising)[number], direction: "up" | "down") => (
    <li key={`${direction}-${entry.productId}`} className="flex items-baseline gap-2 py-2">
      {direction === "up" ? (
        <TrendingUp className="size-3.5 shrink-0 text-positive" aria-hidden />
      ) : (
        <TrendingDown className="size-3.5 shrink-0 text-negative" aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
      <span className="tnum shrink-0 text-xs text-muted-foreground">
        {entry.previousQuantity} → {entry.quantity} sold
      </span>
    </li>
  );

  return (
    <div className="mb-1">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">Moving differently</p>
      <ul className="list-divided">
        {rising.map((entry) => row(entry, "up"))}
        {falling.map((entry) => row(entry, "down"))}
      </ul>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Versus the comparison window, on products that sold at least 5 units in it.
      </p>
    </div>
  );
}

function TopList({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; name: string; primary: string; secondary: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{title}</p>
      <ul className="list-divided">
        {rows.map((row, index) => (
          <li key={row.key} className="flex items-baseline gap-3 py-2.5">
            <span className="tnum w-4 shrink-0 text-xs text-muted-foreground">{index + 1}.</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{row.name}</span>
              <span className="tnum block text-xs text-muted-foreground">{row.secondary}</span>
            </span>
            <span className="tnum shrink-0 text-sm font-semibold">{row.primary}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ restock radar */

const BUCKET_LABEL: Record<ForecastBucket, string> = {
  urgent: "Review urgently",
  soon: "Restock soon",
  sufficient: "Stock appears sufficient",
  insufficient: "Insufficient sales history",
};

const BUCKET_TONE: Record<ForecastBucket, StatusTone> = {
  urgent: "negative",
  soon: "caution",
  sufficient: "positive",
  insufficient: "neutral",
};

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence",
  insufficient: "Insufficient data",
};

function RadarSection({ forecasts }: { forecasts: ForecastRow[] }) {
  const order: ForecastBucket[] = ["urgent", "soon", "sufficient", "insufficient"];
  const grouped = order.map((bucket) => ({
    bucket,
    rows: forecasts
      .filter((row) => row.bucket === bucket)
      .sort((a, b) => (a.daysRemaining ?? 999) - (b.daysRemaining ?? 999))
      .slice(0, bucket === "urgent" || bucket === "soon" ? 8 : 3),
    total: forecasts.filter((row) => row.bucket === bucket).length,
  }));

  return (
    <section className="mb-6">
      <SectionLabel>Restock radar</SectionLabel>

      {forecasts.length === 0 ? (
        <EmptyState
          title="No products to review"
          description="Add products to your inventory and Pulse will watch their recent sales rate."
        />
      ) : (
        <>
          {grouped.map(({ bucket, rows, total }) =>
            rows.length === 0 ? null : (
              <div key={bucket} className="mb-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <StatusBadge tone={BUCKET_TONE[bucket]}>{BUCKET_LABEL[bucket]}</StatusBadge>
                  <span className="text-xs text-muted-foreground">
                    {total} product{total === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="space-y-2">
                  {rows.map((row) => (
                    <ForecastCard key={row.productId} row={row} />
                  ))}
                </ul>
              </div>
            ),
          )}

          <p className="text-xs leading-relaxed text-muted-foreground">
            Estimates use the last 14 days of recorded sales and assume {COVER_DAYS} days of cover
            for a suggested order. No supplier lead time is configured in SAVO, so none is assumed —
            and nothing is reordered automatically. Review the quantity before receiving stock.
          </p>
        </>
      )}
    </section>
  );
}

function ForecastCard({ row }: { row: ForecastRow }) {
  return (
    <li className="glass-1 rounded-xl p-3.5 backdrop-blur-md backdrop-saturate-150">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{row.name}</p>
          <p className="tnum mt-0.5 text-xs text-muted-foreground">
            {row.stock} {row.unit} on shelf · threshold {row.threshold}
            {row.daysRemaining !== null ? ` · ~${row.daysRemaining} days left` : ""}
          </p>
        </div>
        <Link
          to="/app/inventory"
          search={{ shop: undefined, q: row.name }}
          className="press flex h-8 shrink-0 items-center gap-1 rounded-lg bg-positive px-2.5 text-xs font-semibold text-background active:opacity-80"
        >
          <PackagePlus className="size-3.5" aria-hidden />
          Restock
        </Link>
      </div>

      {row.suggestQty !== null ? (
        <p className="mt-2 text-xs font-medium">
          Suggested order:{" "}
          <span className="tnum">
            {row.suggestQty} {row.unit}
          </span>{" "}
          <span className="font-normal text-muted-foreground">
            ({COVER_DAYS} days of cover at {row.avgDailyDemand?.toFixed(2) ?? "—"} / day, floor at
            threshold)
          </span>
        </p>
      ) : null}

      <details className="mt-2">
        <summary className="cursor-pointer select-none text-xs text-muted-foreground">
          Why? · {CONFIDENCE_LABEL[row.confidence]}
        </summary>
        <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-muted-foreground">
          {row.reasons.map((reason) => (
            <li key={reason}>· {reason}</li>
          ))}
        </ul>
      </details>
    </li>
  );
}

/* -------------------------------------------------------- money in / out */

function MoneySection({
  currency,
  overview,
  expenseTotals,
}: {
  currency: string;
  overview: PulseOverview;
  expenseTotals: { category: string; current: number; previous: number }[];
}) {
  return (
    <section className="mb-6">
      <SectionLabel>Money in, money out</SectionLabel>

      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-4">
        <Figure
          label="Cash & mobile money"
          value={formatMoney(overview.collected, currency)}
          note="Payments recorded this window"
        />
        <Figure
          label="Debt repaid"
          value={formatMoney(overview.debtCollected, currency)}
          note="Repayments this window"
        />
        <Figure
          label="Still owed"
          value={formatMoney(overview.outstandingCredit, currency)}
          note="Across all debtors now"
        />
        <Figure
          label="Refunds"
          value={formatMoney(overview.refunds, currency)}
          note="Recorded, not rejected"
        />
      </div>

      {expenseTotals.length > 0 ? (
        <ul className="list-divided">
          {expenseTotals.slice(0, 6).map((row) => (
            <li key={row.category} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium capitalize">
                  {row.category}
                </span>
                {row.previous > 0 ? (
                  <span className="tnum block text-xs text-muted-foreground">
                    was {formatMoney(row.previous, currency)} in the comparison window
                  </span>
                ) : null}
              </span>
              <span className="tnum shrink-0 text-sm font-semibold">
                {formatMoney(row.current, currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No expenses recorded in this window.</p>
      )}

      <Link
        to="/app/debtors"
        search={{ shop: undefined }}
        className="press hover-glass mt-3 flex min-h-12 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-ink/5"
      >
        <HandCoins className="size-4 shrink-0 text-ink-soft" aria-hidden />
        Review credit and repayments
        <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden />
      </Link>
    </section>
  );
}

/* --------------------------------------------------------------- insights */

const SEVERITY_ICON = {
  urgent: TriangleAlert,
  attention: CircleAlert,
  info: Info,
} as const;

const SEVERITY_CLASS = {
  urgent: "bg-negative-soft text-negative",
  attention: "bg-caution-soft text-caution",
  info: "bg-sunken text-muted-foreground",
} as const;

function InsightsSection({
  insights,
  onDismiss,
}: {
  insights: Insight[];
  onDismiss: (id: string) => void;
}) {
  if (insights.length === 0) {
    return (
      <section className="mb-6">
        <SectionLabel>What Pulse notices</SectionLabel>
        <EmptyState
          title="Nothing to flag"
          description="With this window's records, Pulse has no warnings or changes worth interrupting you for. Switch the period for a different look."
        />
      </section>
    );
  }

  return (
    <section className="mb-6">
      <SectionLabel>What Pulse notices</SectionLabel>
      <ul className="space-y-2.5">
        {insights.map((insight) => {
          const Icon = SEVERITY_ICON[insight.severity];
          return (
            <li
              key={insight.id}
              className="glass-1 rounded-xl p-3.5 backdrop-blur-md backdrop-saturate-150"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${SEVERITY_CLASS[insight.severity]}`}
                  aria-hidden
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug">{insight.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {insight.body}
                  </p>

                  <details className="mt-2">
                    <summary className="cursor-pointer select-none text-xs text-muted-foreground">
                      Show the figures · {CONFIDENCE_LABEL[insight.confidence]}
                    </summary>
                    <dl className="mt-1.5 space-y-0.5 text-xs">
                      {insight.evidence.map((entry) => (
                        <div key={entry.label} className="flex justify-between gap-3">
                          <dt className="text-muted-foreground">{entry.label}</dt>
                          <dd className="tnum font-medium">{entry.value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {insight.action ? (
                      <Link
                        to={insight.action.to}
                        search={{ shop: undefined }}
                        className="press flex h-8 items-center gap-1.5 rounded-lg bg-ink px-2.5 text-xs font-semibold text-background active:opacity-80"
                      >
                        {insight.action.label}
                        <ArrowRight className="size-3" aria-hidden />
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onDismiss(insight.id)}
                      className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground active:bg-ink/5"
                    >
                      <X className="size-3" aria-hidden /> Not now
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------ ask pulse */

function AskSection({
  askContext,
  thinHistory,
}: {
  askContext: ReturnType<typeof usePulse>["askContext"];
  thinHistory: boolean;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<AskAnswer | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  function ask(text: string) {
    setQuestion(text);
    if (!askContext) return;
    const result = answerAsk(text, askContext);
    setAnswer(result);
    setUnsupported(result === null);
  }

  return (
    <section className="mb-6">
      <SectionLabel>Ask Pulse</SectionLabel>
      <p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3" aria-hidden />
        Answers are calculated from your records on this device — nothing is sent to an outside AI.
      </p>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (question.trim()) ask(question.trim());
        }}
      >
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Which products made the most money?"
          aria-label="Ask Pulse a question"
          className="h-11"
          autoComplete="off"
          enterKeyHint="go"
        />
        <Button type="submit" className="h-11 shrink-0" disabled={!askContext || !question.trim()}>
          <Send className="size-4" aria-hidden /> Ask
        </Button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {ASK_EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => ask(example)}
            className="rounded-full border border-border bg-sunken px-2.5 py-1 text-[11px] text-muted-foreground active:opacity-70"
          >
            {example}
          </button>
        ))}
      </div>

      {unsupported ? (
        <div className="mt-3">
          <NoticeState
            icon={<Sparkles className="size-4" aria-hidden />}
            title="Not supported yet"
            description={ASK_UNSUPPORTED}
          />
        </div>
      ) : null}

      {answer ? (
        <div className="glass-1 mt-3 rounded-xl p-3.5 backdrop-blur-md backdrop-saturate-150">
          <p className="text-sm font-semibold">{answer.title}</p>
          <dl className="mt-2 space-y-1">
            {answer.lines.map((line) => (
              <div key={line.label} className="flex justify-between gap-3 text-sm">
                <dt className="min-w-0 truncate text-muted-foreground">{line.label}</dt>
                <dd className="tnum shrink-0 font-medium">{line.value}</dd>
              </div>
            ))}
          </dl>
          {answer.note ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{answer.note}</p>
          ) : null}
          {answer.to ? (
            <Link
              to={answer.to}
              search={{ shop: undefined }}
              className="mt-2.5 inline-flex items-center gap-1 text-xs font-medium text-ink-soft"
            >
              Open the screen behind these figures
              <ArrowRight className="size-3" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}

      {thinHistory && !answer ? (
        <p className="mt-2 text-xs text-muted-foreground">
          With more recorded sales, per-product answers will sharpen.
        </p>
      ) : null}
    </section>
  );
}
