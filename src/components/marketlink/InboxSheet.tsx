import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, CheckCheck, Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  useInbox,
  useInboxCounts,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useMarkReleaseRead,
  useReleases,
} from "@/hooks/useMarketCommerce";
import { formatDateTime } from "@/lib/format";
import { textList } from "@/services/marketlink-commerce.service";
import { cn } from "@/lib/utils";

/**
 * The persisted inbox: order events for this account, plus real release notes.
 *
 * The badge is the sum of unread notifications and unread releases. Nothing is
 * counted twice: a release is unread until this user has read *that release*,
 * and the count is per user, not a repeated row per launch.
 */
export function InboxButton({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const counts = useInboxCounts(enabled);
  const unread = (counts.data?.notifications ?? 0) + (counts.data?.releases ?? 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press relative grid size-9 place-items-center rounded-full text-cream/80 transition-colors hover:bg-[var(--brand-raised)] hover:text-cream"
        aria-label={unread > 0 ? `Inbox, ${unread} unread` : "Inbox"}
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 ? (
          <span className="tnum absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-[var(--brand-primary)] px-1 text-[10px] font-bold leading-4 text-[#04140e]">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>
      <InboxSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

function InboxSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [tab, setTab] = useState<"notifications" | "releases">("notifications");
  const inbox = useInbox(open);
  const releases = useReleases();
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const markRelease = useMarkReleaseRead();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto px-4 pb-8 pt-4">
        <SheetHeader className="px-0 pb-3 text-left">
          <SheetTitle className="text-base">Inbox</SheetTitle>
        </SheetHeader>

        <div className="flex gap-1.5" role="tablist" aria-label="Inbox sections">
          {(
            [
              ["notifications", "Notifications"],
              ["releases", "What's new"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={cn(
                "press h-9 rounded-full border px-3.5 text-xs font-medium",
                tab === value
                  ? "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-[#04140e]"
                  : "border-[var(--brand-line)] text-muted-foreground",
              )}
            >
              {label}
            </button>
          ))}
          {tab === "notifications" && (inbox.data ?? []).some((entry) => !entry.read_at) ? (
            <button
              type="button"
              className="press ml-auto inline-flex h-9 items-center gap-1 text-xs font-medium text-muted-foreground underline underline-offset-4"
              disabled={markAll.isPending}
              onClick={() =>
                void markAll
                  .mutateAsync()
                  .then((count) =>
                    toast.success(count > 0 ? `Marked ${count} read` : "Nothing unread"),
                  )
                  .catch((error: unknown) =>
                    toast.error(
                      error instanceof Error ? error.message : "Could not update the inbox.",
                    ),
                  )
              }
            >
              <CheckCheck className="size-3.5" aria-hidden /> Mark all read
            </button>
          ) : null}
        </div>

        {tab === "notifications" ? (
          inbox.isLoading ? (
            <div className="flex justify-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" aria-hidden />
            </div>
          ) : (inbox.data ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Nothing here yet. Order updates and settlement confirmations arrive here.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(inbox.data ?? []).map((entry) => {
                const isUnread = !entry.read_at;
                return (
                  <li key={entry.id}>
                    <Link
                      to={entry.target_path}
                      onClick={() => {
                        if (isUnread) void markOne.mutateAsync(entry.id).catch(() => undefined);
                        onOpenChange(false);
                      }}
                      className={cn(
                        "block rounded-lg border p-3 transition-colors",
                        isUnread
                          ? "border-[var(--brand-primary)]/40 bg-[var(--brand-raised)]"
                          : "border-[var(--brand-line)]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{entry.title}</p>
                        {isUnread ? (
                          <span
                            className="mt-1 size-2 shrink-0 rounded-full bg-[var(--brand-primary)]"
                            aria-label="Unread"
                          />
                        ) : null}
                      </div>
                      {entry.body ? (
                        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                          {entry.body}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {entry.shop_name} · {formatDateTime(entry.created_at)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )
        ) : releases.isLoading ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </div>
        ) : (releases.data ?? []).length === 0 ? (
          <div className="py-10 text-center">
            <Megaphone className="mx-auto size-6 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm text-muted-foreground">
              No releases have been published yet. SAVO only announces an update after it is live.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {(releases.data ?? []).map((release) => (
              <li
                key={release.id}
                className={cn(
                  "rounded-lg border p-3",
                  release.read
                    ? "border-[var(--brand-line)]"
                    : "border-[var(--brand-primary)]/40 bg-[var(--brand-raised)]",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">{release.title}</p>
                  <span className="tnum text-[11px] text-muted-foreground">{release.version}</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {formatDateTime(release.published_at)}
                </p>
                {release.summary ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {release.summary}
                  </p>
                ) : null}
                {textList(release.highlights as never).length > 0 ? (
                  <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
                    {textList(release.highlights as never).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : null}
                {textList(release.fixes as never).length > 0 ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">Fixes:</span>{" "}
                    {textList(release.fixes as never).join(" · ")}
                  </p>
                ) : null}
                {release.notes_path ? (
                  <Link
                    to={release.notes_path}
                    className="mt-2 inline-block text-xs font-medium underline underline-offset-4"
                    onClick={() => {
                      if (!release.read)
                        void markRelease.mutateAsync(release.id).catch(() => undefined);
                      onOpenChange(false);
                    }}
                  >
                    Full release notes
                  </Link>
                ) : null}
                {!release.read ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-8"
                    disabled={markRelease.isPending}
                    onClick={() => void markRelease.mutateAsync(release.id).catch(() => undefined)}
                  >
                    Mark as read
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
