import { useState } from "react";
import { History } from "lucide-react";

import { EmptyState, ErrorState, LoadingState, NoticeState } from "@/components/app/AppChrome";
import { Button } from "@/components/ui/button";
import { useAuditLog, useMemberNames } from "@/hooks/usePrivacy";
import type { AuditLogEntry } from "@/types/savo";

/**
 * The shop's activity log.
 *
 * Read-only by construction: `audit_log` grants a signed-in user `SELECT` and
 * nothing else, so there is no edit or delete control to grey out, and no
 * reason to add one. If a line is wrong, the honest fix is another line — the
 * log is an append-only record by design, which is the only property that makes
 * it worth keeping.
 *
 * The filter is a client-side substring match over the action and summary. The
 * table is capped at 100 rows on purpose: an activity log that loads a shop's
 * entire history to render a phone screen is a log nobody opens.
 */
export function ActivityLog({ shopId }: { shopId: string }) {
  const query = useAuditLog(shopId, 100);
  const [filter, setFilter] = useState("");

  /**
   * `actor_id` is a UUID. Printing eight characters of it would be technically
   * true and completely useless to a shopkeeper, so the member directory is
   * resolved to a name — the same directory the Employees screen renders, so
   * the log discloses nothing an employee could not already see.
   */
  const members = useMemberNames(shopId);
  const names = members.data;

  if (query.isLoading) return <LoadingState label="Loading the activity log…" />;
  if (query.isError) {
    return <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />;
  }

  const entries = query.data ?? [];
  const needle = filter.trim().toLowerCase();
  const visible = needle
    ? entries.filter(
        (entry) =>
          entry.action.toLowerCase().includes(needle) ||
          (entry.summary ?? "").toLowerCase().includes(needle),
      )
    : entries;

  return (
    <div>
      <div className="flex items-start gap-2">
        <History className="mt-0.5 size-4 shrink-0 text-ink-soft" aria-hidden />
        <p className="text-sm leading-relaxed text-muted-foreground">
          Every sale, refund, stock movement, expense, staff change and setting change, with the
          person who did it and the time. Entries are written by the database when the action
          happens and cannot be edited or removed from the app.
        </p>
      </div>

      {entries.length > 0 ? (
        <div className="mt-4">
          <label htmlFor="activity-filter" className="block text-sm font-medium text-foreground">
            Search
          </label>
          <input
            id="activity-filter"
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="refund, stock, employee…"
            className="mt-1.5 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
          />
        </div>
      ) : null}

      {entries.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Nothing logged yet"
            description="The first line appears as soon as someone makes a sale, moves stock or takes a repayment."
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="mt-4">
          <NoticeState
            title="Nothing matches that"
            description="Try a shorter word — “refund”, “stock”, “employee”, “shop”."
            icon={<History className="size-4" aria-hidden />}
          />
          <Button variant="outline" className="mt-3 h-11" onClick={() => setFilter("")}>
            Clear the search
          </Button>
        </div>
      ) : (
        <>
          <ol className="mt-4 space-y-2">
            {visible.map((entry) => (
              <li key={entry.id}>
                <ActivityRow entry={entry} names={names} />
              </li>
            ))}
          </ol>
          {entries.length >= 100 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing the {entries.length} most recent entries. Older entries are kept for two years
              in the database but are not loaded here.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

/** One entry, with the action read as a sentence rather than a slug. */
function ActivityRow({
  entry,
  names,
}: {
  entry: AuditLogEntry;
  names: Map<string, string> | undefined;
}) {
  return (
    <div className="rounded-lg border border-border bg-sunken px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-medium text-foreground">{describeAction(entry.action)}</p>
        <time dateTime={entry.created_at} className="tnum text-xs text-muted-foreground">
          {new Date(entry.created_at).toLocaleString("en-KE", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </time>
      </div>
      {entry.summary ? (
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{entry.summary}</p>
      ) : null}
      <p className="mt-1 text-xs text-muted-foreground">{actorLabel(entry.actor_id, names)}</p>
    </div>
  );
}

/** `refund.created` → “Refund created”. Kept in one place so the log reads alike. */
function describeAction(action: string): string {
  const [group, verb] = action.split(".");
  const groupLabel =
    {
      sale: "Sale",
      refund: "Refund",
      stock: "Stock",
      expense: "Expense",
      employee: "Employee",
      access_code: "Access code",
      shop: "Shop",
      debtor: "Debtor",
    }[group ?? ""] ?? group;
  const verbLabel =
    {
      created: "created",
      updated: "updated",
      deleted: "deleted",
      moved: "moved",
      payment_recorded: "payment recorded",
      amended: "amended",
      joined: "joined",
      removed: "removed",
      status_changed: "status changed",
      role_changed: "role changed",
      refunds_changed: "refund setting changed",
      joining_changed: "staff-joining setting changed",
      movement_deleted: "movement removed",
    }[verb ?? ""] ?? verb;
  return `${groupLabel} ${verbLabel}`.trim();
}

/**
 * A member who has left has no name left to show: the log deliberately stores
 * only the account reference, and the row survives the account's deletion. So
 * the honest label is "a member who has since left", not a stale name.
 */
function actorLabel(actorId: string | null, names: Map<string, string> | undefined): string {
  if (!actorId) return "By a member who has since left Pith";
  const name = names?.get(actorId);
  return name ? `By ${name}` : "By a team member who has since left the shop";
}
