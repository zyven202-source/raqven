import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Download, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ErrorState, LoadingState, NoticeState } from "@/components/app/AppChrome";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useDeleteShop, useShopDeletionPreview } from "@/hooks/useShops";
import type { DeletionCountKey, DeletionCounts } from "@/services/shops.service";

/**
 * Settings › Delete this shop.
 *
 * This is the most destructive thing in the product, so it is the one screen that
 * spends its space on consequences instead of controls. The rules it follows:
 *
 *   1. **Nothing is deleted by a button press.** The panel is closed by default
 *      and the counts are only fetched once it is open — nine hundred shopkeepers
 *      scrolling past a danger zone should not each cost fourteen table counts,
 *      and nobody should be shown a deletion they did not ask about.
 *   2. **The numbers are the database's.** Every count comes from
 *      `shop_deletion_preview`, which is owner-only. The screen does not estimate,
 *      round up, or say "your sales history" when it can say "412 sales".
 *   3. **The confirmation cannot be clicked past.** The button stays disabled
 *      until the shop's own name is typed back, and `delete_shop` re-checks that
 *      string server-side against `shops.name` — so this is a guard on accidents,
 *      not the guard on security.
 *   4. **What survives is stated as plainly as what does not.** An owner deciding
 *      between deleting now and deleting later is making a decision about their
 *      accounting record, and the screen should not let them make it on a false
 *      idea that everything disappears.
 *
 * What it deliberately does **not** do: offer an undo, a grace period, or a
 * "cancel deletion". Nothing in this schema is soft-deleted, so none of those
 * exist to be offered. A button that says "Cancel" on a screen whose other button
 * is irreversible would be the one dishonest control here.
 */
export function DeleteShopSection() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";

  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const preview = useShopDeletionPreview(shopId, open);
  const remove = useDeleteShop();

  // The name the database will compare against is the one the preview returned,
  // not whatever is in the shop list on screen: if the shop was renamed between
  // the two, the owner should be typing what the server is actually holding.
  const target = preview.data?.shopName ?? "";
  const matches =
    typed.trim().length > 0 && typed.trim().toLowerCase() === target.trim().toLowerCase();

  function close() {
    setOpen(false);
    setTyped("");
    remove.reset();
  }

  async function confirm() {
    if (!matches) return;
    try {
      const result = await remove.mutateAsync({ shopId, confirmShopName: typed });
      toast.success(`${result.shopName} deleted`, {
        description: describe(result.counts, result.filesRemoved),
      });
      // No navigation: the app shell drops to its no-shop state on its own once
      // the membership list refetches, which is the right place to land.
    } catch (error) {
      toast.error("The shop was not deleted", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    }
  }

  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="text-ink-soft">
          <Trash2 className="size-4" aria-hidden />
        </span>
        Delete this shop
      </h3>

      <NoticeState
        tone="danger"
        title="This deletes the shop and its books, not just the shop"
        description="Every sale, payment, refund, debtor balance, product, stock movement, expense, staff membership and activity entry belonging to this shop is removed, and it cannot be undone or recovered. Your SAVO account is not deleted — you can open another shop straight away. Export anything you want to keep from Reports first; a report is not a backup."
      />

      {!open ? (
        <Button
          variant="outline"
          className="mt-3 h-11 w-full text-negative"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="size-4" aria-hidden />
          Delete this shop…
        </Button>
      ) : (
        <div className="mt-3 rounded-lg border border-negative/30 bg-negative-soft/50 p-3.5">
          {preview.isLoading ? (
            <LoadingState label="Counting what this would delete…" timeoutMs={8000} />
          ) : preview.isError ? (
            <ErrorState message={preview.error.message} onRetry={() => void preview.refetch()} />
          ) : preview.data ? (
            <Counts
              counts={preview.data.counts}
              dataRequestsRetained={preview.data.dataRequestsRetained}
              shopId={shopId}
            />
          ) : null}

          {remove.isError ? (
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-negative">
              <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
              {remove.error instanceof Error ? remove.error.message : "That did not work."}
            </p>
          ) : null}

          {/*
            Gated on the preview, not on the loading state. Without it there is no
            name to type — the shop's real one comes back from the database, not
            from the shop list on screen — and an unlabelled input asking for a
            confirmation nobody can give is worse than no input at all.
          */}
          {preview.data ? (
            <div className="mt-3">
              <label htmlFor="delete-shop-confirm" className="text-sm font-medium text-foreground">
                Type <span className="font-semibold">{target}</span> to confirm
              </label>
              <Input
                id="delete-shop-confirm"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={target}
                className="mt-1.5 h-12"
                autoComplete="off"
                autoCapitalize="words"
                spellCheck={false}
                disabled={remove.isPending}
              />
            </div>
          ) : null}

          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="h-11 flex-1" onClick={close}>
              Keep my shop
            </Button>
            <Button
              className="h-11 flex-1 bg-negative text-negative-foreground hover:bg-negative/90"
              onClick={() => void confirm()}
              disabled={!matches || remove.isPending || preview.isLoading}
            >
              {remove.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Delete it for good
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * The counts, and what is left afterwards.
 *
 * Only non-zero counts are listed. A list that says "0 refunds" is noise, and a
 * list padded with zeros is a list a person stops reading before reaching the one
 * number they needed — how many debtors still owe them money.
 */
function Counts({
  counts,
  dataRequestsRetained,
  shopId,
}: {
  counts: DeletionCounts;
  dataRequestsRetained: number;
  shopId: string;
}) {
  const rows = LABELS.filter((row) => counts[row.key] > 0);

  return (
    <>
      <p className="text-sm font-medium text-negative">Deleting this shop removes, permanently:</p>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {rows.length === 0 ? (
          <li>This shop has no records yet — only the shop itself.</li>
        ) : (
          rows.map((row) => (
            <li key={row.key} className="flex items-baseline justify-between gap-3">
              <span>{row.label}</span>
              <span className="tnum shrink-0 font-medium text-foreground">
                {counts[row.key].toLocaleString("en-KE")}
              </span>
            </li>
          ))
        )}
      </ul>

      {counts.staff > 1 ? (
        <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
          {counts.staff - 1} other staff {counts.staff === 2 ? "member loses" : "members lose"}{" "}
          access to this shop the moment it goes. Their accounts are not deleted.
        </p>
      ) : null}

      <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Kept:</span> your SAVO account, and a record
        that this shop was deleted and how many records it held — so there is an answer if anyone
        asks what happened to them later.
        {dataRequestsRetained > 0
          ? ` ${dataRequestsRetained} data request${
              dataRequestsRetained === 1 ? "" : "s"
            } filed about this shop also stay on file, with the shop link removed.`
          : ""}
      </p>

      <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
        <Link
          to="/app/reports"
          search={{ shop: shopId }}
          params={{}}
          className="inline-flex items-center gap-1.5 font-medium text-ink hover:underline"
        >
          <Download className="size-3.5" aria-hidden />
          Export from Reports first
        </Link>
      </p>
    </>
  );
}

/**
 * The count keys, in the order a shopkeeper reads them: the money first, then
 * the stock, then the people, then the paperwork.
 */
const LABELS: { key: DeletionCountKey; label: string }[] = [
  { key: "sales", label: "Sales" },
  { key: "payments", label: "Payments recorded against them" },
  { key: "refunds", label: "Refunds" },
  { key: "debtors", label: "Customers who owe money" },
  { key: "debtor_payments", label: "Payments those customers made" },
  { key: "products", label: "Products in the catalogue" },
  { key: "inventory_movements", label: "Stock movements" },
  { key: "categories", label: "Product categories" },
  { key: "expenses", label: "Expenses" },
  { key: "staff", label: "Staff memberships" },
  { key: "access_codes", label: "Staff access codes" },
  { key: "activity_entries", label: "Entries in the activity log" },
  // `sale_items` and `refund_items` are counted but never listed: they are the
  // line items behind the sales and refunds above, and showing "1,204 sale line
  // items" next to "412 sales" reads as double counting rather than detail.
];

/** One line describing what just went, for the toast. */
function describe(counts: DeletionCounts, filesRemoved: number | null): string {
  const parts = LABELS.filter((row) => counts[row.key] > 0)
    .slice(0, 3)
    .map((row) => `${counts[row.key].toLocaleString("en-KE")} ${row.label.toLowerCase()}`);
  const records = parts.length > 0 ? ` ${parts.join(", ")} and more removed.` : " It was empty.";
  const files =
    filesRemoved === null
      ? " Some files could not be checked for removal."
      : filesRemoved > 0
        ? ` ${filesRemoved} file${filesRemoved === 1 ? "" : "s"} removed.`
        : "";
  return `${records}${files}`;
}
