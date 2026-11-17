import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Download,
  Loader2,
  ShieldAlert,
  TriangleAlert,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { ErrorState, LoadingState, StateBlock } from "@/components/app/AppChrome";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  fetchAdminActivity,
  fetchAdminActivityCsv,
  fetchAdminErrors,
  fetchAdminOverview,
  fetchIsPlatformAdmin,
  type AdminActivityRow,
  type AdminOverview,
} from "@/services/analytics.service";

export const Route = createFileRoute("/_authenticated/admin/analytics")({
  head: () => ({ meta: [{ title: "SAVO — Platform console" }] }),
  component: AdminAnalyticsPage,
});

type RangeKey = "7" | "30" | "90";

const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
];

type Tab = "overview" | "activity" | "errors";

const TABS: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: "overview", label: "Overview", icon: BarChart3 },
  { key: "activity", label: "Activity", icon: Activity },
  { key: "errors", label: "Errors", icon: TriangleAlert },
];

/** `YYYY-MM-DD` in the viewer's own calendar, which is what the RPC expects. */
function isoDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function rangeFor(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (days - 1));
  return { from: isoDay(from), to: isoDay(to) };
}

/**
 * The platform console.
 *
 * This screen is the one place that looks across every shop, so it is written
 * to be boring about access: `fetchIsPlatformAdmin` asks the database, the
 * database answers from `app.platform_admins`, and every read below is an RPC
 * that repeats that check itself. Hiding this route in the UI is convenience;
 * the refusal is in PostgreSQL.
 *
 * Nothing here is derived client-side — the figures, the series and the feed all
 * come from rows that already exist, so an empty chart means "nothing happened",
 * never "we could not think of a number".
 */
function AdminAnalyticsPage() {
  const access = useQuery({
    queryKey: ["platform-admin"],
    queryFn: fetchIsPlatformAdmin,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  if (access.isLoading) return <LoadingState label="Checking access…" />;

  if (!access.data) {
    return (
      <div className="min-h-screen bg-background">
        <ConsoleHeader />
        <main className="mx-auto w-full max-w-3xl px-4 py-10">
          <StateBlock
            icon={<ShieldAlert className="size-5" aria-hidden />}
            title="Not available"
            body="This console is limited to the platform owner. Your shop workspace is unaffected."
            action={
              <Button asChild variant="outline">
                <Link to="/dashboard">Back to my shops</Link>
              </Button>
            }
          />
        </main>
      </div>
    );
  }

  return <Console />;
}

function ConsoleHeader({ action }: { action?: React.ReactNode }) {
  return (
    <header className="border-b border-border bg-card/70 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 sm:px-6">
        <Logo compact />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Platform</p>
          <h1 className="truncate text-[1.0625rem] leading-tight">Console</h1>
        </div>
        {action}
        <Button asChild variant="ghost" className="h-9 gap-1.5 px-2.5 text-sm">
          <Link to="/dashboard">
            <ArrowLeft className="size-4" aria-hidden />
            <span className="hidden sm:inline">Workspace</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}

function Console() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30");
  const [tab, setTab] = useState<Tab>("overview");

  const days = RANGES.find((range) => range.key === rangeKey)?.days ?? 30;
  const range = useMemo(() => rangeFor(days), [days]);

  const overview = useQuery({
    queryKey: ["admin-overview", range.from, range.to],
    queryFn: () => fetchAdminOverview(range.from, range.to),
    staleTime: 60_000,
  });

  return (
    <div className="min-h-screen bg-background">
      <ConsoleHeader
        action={
          <div className="flex items-center rounded-lg border border-border bg-sunken p-0.5">
            {RANGES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setRangeKey(option.key)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
                  rangeKey === option.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                aria-pressed={rangeKey === option.key}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-4 sm:px-6">
        <nav className="mb-5 flex gap-1 border-b border-border" aria-label="Console sections">
          {TABS.map((entry) => {
            const Icon = entry.icon;
            const selected = tab === entry.key;
            return (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  selected
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {entry.label}
              </button>
            );
          })}
        </nav>

        {tab === "overview" ? (
          overview.isLoading ? (
            <LoadingState label="Gathering platform numbers…" />
          ) : overview.isError ? (
            <ErrorState message={overview.error.message} onRetry={() => void overview.refetch()} />
          ) : overview.data ? (
            <Overview data={overview.data} />
          ) : null
        ) : null}

        {tab === "activity" ? <ActivityTab range={range} /> : null}
        {tab === "errors" ? <ErrorsTab range={range} /> : null}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function Figure({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={cn("glass-1 rounded-xl p-4", emphasis && "sm:col-span-2")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "tnum mt-1 font-semibold leading-none",
          emphasis ? "text-[2.25rem]" : "text-[1.5rem]",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Overview({ data }: { data: AdminOverview }) {
  const peak = Math.max(
    1,
    ...data.daily.map((day) => day.visitors),
    ...data.daily.map((day) => day.sales),
  );
  const featurePeak = Math.max(1, ...data.events.by_name.map((event) => event.count));
  const withTraffic = data.daily.filter((day) => day.visitors > 0 || day.sales > 0);

  return (
    <div className="space-y-7">
      <section>
        <p className="text-sm text-muted-foreground">
          {data.from} to {data.to} · all shops
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure
            label="Accounts"
            value={data.users.total.toLocaleString()}
            hint={`${data.users.new_in_range.toLocaleString()} created in this range`}
            emphasis
          />
          <Figure
            label="Active shops"
            value={data.shops.active.toLocaleString()}
            hint={`${data.shops.selling.toLocaleString()} sold something in range`}
          />
          <Figure
            label="Sales recorded"
            value={data.business.sales_count.toLocaleString()}
            hint={formatMoney(data.business.sales_total)}
          />
        </div>
      </section>

      <section>
        <h2 className="eyebrow mb-2">Activity, day by day</h2>
        <div className="glass-1 rounded-xl p-4">
          {withTraffic.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No visits or sales recorded in this range yet.
            </p>
          ) : (
            <div className="flex h-36 items-end gap-[3px]" aria-hidden>
              {data.daily.map((day) => {
                const visitHeight = (day.visitors / peak) * 100;
                const saleHeight = (day.sales / peak) * 100;
                return (
                  <div
                    key={day.day}
                    className="group relative flex min-w-0 flex-1 flex-col justify-end gap-[2px]"
                    title={`${day.day}: ${day.visitors} visitors, ${day.sales} sales`}
                  >
                    <div
                      className="rounded-t-[2px] bg-info/45"
                      style={{ height: `${Math.max(visitHeight, day.visitors > 0 ? 3 : 0)}%` }}
                    />
                    <div
                      className="rounded-b-[2px] bg-primary/80"
                      style={{ height: `${Math.max(saleHeight, day.sales > 0 ? 3 : 0)}%` }}
                    />
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-info/45" aria-hidden /> Visitors
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-primary/80" aria-hidden /> Sales
            </span>
            <span className="ml-auto tnum">{data.daily.length} days</span>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="glass-1 rounded-xl p-4">
          <h2 className="eyebrow mb-3">Audience</h2>
          <dl className="space-y-2.5 text-sm">
            <Line label="Visits" value={data.audience.visits} />
            <Line label="Unique visitors" value={data.audience.unique_visitors} />
            <Line label="New visitors" value={data.audience.new_visitors} />
            <Line label="Returning" value={data.audience.returning_visitors} />
            <Line label="Screens viewed" value={data.audience.screens_viewed} />
            <Line
              label="Average session"
              value={`${Math.round(data.audience.avg_session_seconds)}s`}
            />
          </dl>
        </div>

        <div className="glass-1 rounded-xl p-4">
          <h2 className="eyebrow mb-3">Signed-in usage</h2>
          <dl className="space-y-2.5 text-sm">
            <Line label="Daily active" value={data.active_users.dau} />
            <Line label="Weekly active" value={data.active_users.wau} />
            <Line label="Monthly active" value={data.active_users.mau} />
            <Line label="Active in range" value={data.active_users.in_range} />
            <Line label="New this week" value={data.users.new_7d} />
            <Line label="New this month" value={data.users.new_30d} />
          </dl>
        </div>
      </section>

      <section>
        <h2 className="eyebrow mb-2">What shops did</h2>
        <div className="glass-1 rounded-xl p-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Line label="Products created" value={data.business.products_created} />
            <Line label="Stock movements" value={data.business.stock_moves} />
            <Line label="Refunds" value={data.business.refunds_count} />
            <Line label="Debtors created" value={data.business.debtors_created} />
            <Line
              label="Debt repayments"
              value={formatMoney(data.business.debtor_payments_total)}
            />
            <Line label="Expenses" value={formatMoney(data.business.expenses_total)} />
          </dl>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <div className="glass-1 rounded-xl p-4">
          <h2 className="eyebrow mb-3">Feature usage</h2>
          {data.events.by_name.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No product events in this range.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {data.events.by_name.slice(0, 10).map((event) => (
                <li key={event.event}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{event.label}</span>
                    <span className="tnum shrink-0 text-muted-foreground">
                      {event.count.toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${Math.max((event.count / featurePeak) * 100, 3)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="glass-1 rounded-xl p-4">
          <h2 className="eyebrow mb-3">Most opened screens</h2>
          {data.screens.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Screen views are recorded from the app as people use it.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {data.screens.map((screen) => (
                <li key={screen.route} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
                    {screen.route}
                  </span>
                  <span className="tnum shrink-0">{screen.views.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tnum font-medium">
        {typeof value === "number" ? value.toLocaleString() : value}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity
// ---------------------------------------------------------------------------

function ActivityTab({ range }: { range: { from: string; to: string } }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const limit = 50;

  const feed = useQuery({
    queryKey: ["admin-activity", range.from, range.to, search, page],
    queryFn: () =>
      fetchAdminActivity({
        limit,
        offset: page * limit,
        search: search.trim() || undefined,
        from: `${range.from}T00:00:00Z`,
        to: `${range.to}T23:59:59Z`,
      }),
    staleTime: 30_000,
  });

  async function exportCsv() {
    setExporting(true);
    try {
      const csv = await fetchAdminActivityCsv({
        from: `${range.from}T00:00:00Z`,
        to: `${range.to}T23:59:59Z`,
      });
      const saved = downloadCsv(`savo-activity-${range.from}-to-${range.to}.csv`, csv);
      if (!saved) toast.error("The browser refused the download.");
      else toast.success("Activity exported.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The export failed.");
    } finally {
      setExporting(false);
    }
  }

  const rows = feed.data?.rows ?? [];
  const total = feed.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          placeholder="Search by event, shop or person…"
          className="h-10 min-w-48 flex-1"
          aria-label="Search activity"
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void exportCsv()}
          disabled={exporting}
          className="h-10 gap-2"
        >
          {exporting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Download className="size-4" aria-hidden />
          )}
          Export CSV
        </Button>
      </div>

      {feed.isLoading ? (
        <LoadingState label="Reading the activity stream…" />
      ) : feed.isError ? (
        <ErrorState message={feed.error.message} onRetry={() => void feed.refetch()} />
      ) : rows.length === 0 ? (
        <div className="glass-1 rounded-xl">
          <StateBlock
            icon={<Activity className="size-5" aria-hidden />}
            title="Nothing recorded yet"
            body={
              search
                ? "No activity matches that search in this range."
                : "The stream fills as people use SAVO. Screens and real actions are recorded as they happen."
            }
          />
        </div>
      ) : (
        <>
          <ul className="glass-1 divide-y divide-border overflow-hidden rounded-xl">
            {rows.map((row) => (
              <ActivityRow key={row.id} row={row} />
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span className="tnum">
              {total.toLocaleString()} event{total === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                className="h-9"
                disabled={page === 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                Newer
              </Button>
              <span className="tnum text-xs">
                {page + 1} / {pages}
              </span>
              <Button
                variant="outline"
                className="h-9"
                disabled={page + 1 >= pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Older
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const CATEGORY_TONE: Record<string, string> = {
  auth: "bg-info-soft text-info",
  shop: "bg-positive-soft text-positive",
  pos: "bg-primary/10 text-primary",
  inventory: "bg-caution-soft text-caution",
  money: "bg-secondary text-secondary-foreground",
  insights: "bg-sunken text-muted-foreground",
  acquisition: "bg-sunken text-muted-foreground",
};

function ActivityRow({ row }: { row: AdminActivityRow }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{row.title}</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              CATEGORY_TONE[row.category] ?? "bg-sunken text-muted-foreground",
            )}
          >
            {row.category}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {[row.actor, row.shop, row.route].filter(Boolean).join(" · ") || "Anonymous visitor"}
        </p>
      </div>
      <time
        className="tnum shrink-0 text-right text-[11px] leading-tight text-muted-foreground"
        dateTime={row.occurred_at}
      >
        {formatDateTime(row.occurred_at)}
      </time>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

function ErrorsTab({ range }: { range: { from: string; to: string } }) {
  const [page, setPage] = useState(0);
  const limit = 50;

  const feed = useQuery({
    queryKey: ["admin-errors", range.from, range.to, page],
    queryFn: () =>
      fetchAdminErrors({
        limit,
        offset: page * limit,
        from: `${range.from}T00:00:00Z`,
        to: `${range.to}T23:59:59Z`,
      }),
    staleTime: 30_000,
  });

  if (feed.isLoading) return <LoadingState label="Reading the error log…" />;
  if (feed.isError)
    return <ErrorState message={feed.error.message} onRetry={() => void feed.refetch()} />;

  const rows = feed.data?.rows ?? [];
  const total = feed.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  if (rows.length === 0) {
    return (
      <div className="glass-1 rounded-xl">
        <StateBlock
          icon={<ShieldAlert className="size-5" aria-hidden />}
          title="No errors recorded"
          body="Failures the app could not recover from are logged here with the screen they happened on."
        />
      </div>
    );
  }

  return (
    <div>
      <ul className="glass-1 divide-y divide-border overflow-hidden rounded-xl">
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                  row.severity === "fatal"
                    ? "bg-negative-soft text-negative"
                    : row.severity === "error"
                      ? "bg-caution-soft text-caution"
                      : "bg-sunken text-muted-foreground",
                )}
              >
                {row.severity}
              </span>
              <span className="text-xs text-muted-foreground">{row.category}</span>
              <time className="tnum ml-auto text-[11px] text-muted-foreground">
                {formatDateTime(row.occurred_at)}
              </time>
            </div>
            <p className="mt-1 text-sm leading-relaxed">{row.message}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {[row.route, row.actor, row.app_version].filter(Boolean).join(" · ") ||
                "Unknown screen"}
            </p>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span className="tnum">{total.toLocaleString()} logged</span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-9"
            disabled={page === 0}
            onClick={() => setPage((current) => Math.max(0, current - 1))}
          >
            Newer
          </Button>
          <span className="tnum text-xs">
            {page + 1} / {pages}
          </span>
          <Button
            variant="outline"
            className="h-9"
            disabled={page + 1 >= pages}
            onClick={() => setPage((current) => current + 1)}
          >
            Older
          </Button>
        </div>
      </div>
    </div>
  );
}
