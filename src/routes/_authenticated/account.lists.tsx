import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Copy, Link2, Plus, RotateCcw, Search, Share2, Trash2, X } from "lucide-react";

import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { MarketShell } from "@/components/marketlink/MarketShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  useAddListItem,
  useCreateList,
  useDeleteList,
  useListPayload,
  useMyLists,
  useRemoveListItem,
  useRenameList,
  useRotateShareToken,
  useSetShareEnabled,
  useUpdateListItem,
} from "@/hooks/useMarketCommerce";
import { useMarketFeed } from "@/hooks/useMarketlink";
import { useSession } from "@/hooks/useSession";
import { formatMoney } from "@/lib/format";
import { SITE_URL } from "@/lib/seo";
import { marketImageUrl } from "@/services/marketlink.service";
import type { ListCandidate } from "@/types/marketlink";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/account/lists")({
  head: () => ({
    meta: [{ title: "SAVO — Shopping lists" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AccountLists,
});

/**
 * SAVO Circles.
 *
 * A list belongs to its owner. Sharing hands out a token, and the public view
 * built from that token contains the items and their candidates only — never
 * the owner's account, addresses or other lists. Matching is name-based and
 * deterministic, and every price shown is a live listing price.
 */
function AccountLists() {
  const { session } = useSession();
  const lists = useMyLists(Boolean(session));
  const [selected, setSelected] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const create = useCreateList();
  const rename = useRenameList();
  const remove = useDeleteList();
  const rotate = useRotateShareToken();
  const share = useSetShareEnabled();
  const payload = useListPayload(session ? selected : null, null);
  const addItem = useAddListItem(selected ?? "");
  const updateItem = useUpdateListItem();
  const removeItem = useRemoveListItem();

  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [search, setSearch] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const debounced = useDebouncedValue(search, 300);
  const searchFeed = useMarketFeed(
    debounced.trim()
      ? { search: debounced.trim(), inStock: true, limit: 6 }
      : { search: "__idle__", limit: 0 },
    Boolean(debounced.trim()),
  );
  const results = debounced.trim() ? (searchFeed.data?.pages[0]?.items ?? []) : [];

  const current = payload.data;
  const shareUrl = current?.share_token ? `${SITE_URL}/list/${current.share_token}` : null;

  function startRename() {
    if (!current) return;
    setRenameValue(current.name);
    setRenaming(true);
  }

  /**
   * Deleting a list is not undoable and breaks any link that was shared, so it
   * goes through the product's confirmation dialog rather than firing on the
   * press. Removing one item stays instant: an item is a line you can add back.
   */
  async function deleteCurrentList() {
    if (!current) return;
    try {
      await remove.mutateAsync(current.id);
      setDeleteOpen(false);
      setSelected(null);
      toast.success("List deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete.");
    }
  }

  return (
    <MarketShell back={{ to: "/market", label: "Marketplace" }}>
      <PageContainer className="pb-12 pt-6">
        <PageHeader
          eyebrow="SAVO Circles"
          title="Shopping lists"
          subtitle="A list is yours. Share a read-only link when you want help gathering the items."
        />

        <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <section>
            <div className="flex gap-2">
              <Input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="New list name"
                aria-label="New list name"
                maxLength={80}
                className="h-10"
              />
              <Button
                className="h-10 shrink-0"
                disabled={create.isPending || newName.trim().length === 0}
                onClick={() =>
                  void create
                    .mutateAsync(newName)
                    .then((id) => {
                      setNewName("");
                      setSelected(id);
                      toast.success("List created");
                    })
                    .catch((error: unknown) =>
                      toast.error(
                        error instanceof Error ? error.message : "Could not create the list.",
                      ),
                    )
                }
              >
                <Plus className="size-4" /> New
              </Button>
            </div>

            {lists.isLoading ? (
              <LoadingState label="Loading your lists…" />
            ) : lists.isError ? (
              <ErrorState message={lists.error.message} onRetry={() => void lists.refetch()} />
            ) : (lists.data ?? []).length === 0 ? (
              <p className="mt-4 rounded-lg border border-[var(--brand-line)] p-4 text-sm text-muted-foreground">
                No lists yet. Create one for a market run, a restock, or a gift you are planning.
              </p>
            ) : (
              <ul className="mt-3 space-y-1.5">
                {(lists.data ?? []).map((list) => (
                  <li key={list.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(list.id)}
                      aria-pressed={selected === list.id}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                        selected === list.id
                          ? "border-[var(--brand-primary)] bg-[var(--brand-raised)]"
                          : "border-[var(--brand-line)] hover:bg-[var(--brand-surface)]",
                      )}
                    >
                      <span className="block truncate text-sm font-medium">{list.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {list.item_count} item{list.item_count === 1 ? "" : "s"} · {list.open_count}{" "}
                        still needed
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="min-w-0">
            {!selected ? (
              <EmptyState
                title="Pick a list"
                description="Choose a list on the left, or create a new one, to add items and compare real products."
              />
            ) : payload.isLoading ? (
              <LoadingState label="Loading the list…" />
            ) : payload.isError ? (
              <ErrorState message={payload.error.message} onRetry={() => void payload.refetch()} />
            ) : current ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {renaming ? (
                    <>
                      <Input
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        aria-label="List name"
                        maxLength={80}
                        className="h-9 max-w-xs"
                      />
                      <Button
                        size="sm"
                        className="h-9"
                        disabled={rename.isPending}
                        onClick={() =>
                          void rename
                            .mutateAsync({ id: current.id, name: renameValue })
                            .then(() => {
                              setRenaming(false);
                              toast.success("Renamed");
                            })
                            .catch((error: unknown) =>
                              toast.error(
                                error instanceof Error ? error.message : "Could not rename.",
                              ),
                            )
                        }
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-9"
                        onClick={() => setRenaming(false)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <h2 className="font-display text-xl font-semibold">{current.name}</h2>
                      <Button size="sm" variant="outline" className="h-10" onClick={startRename}>
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-10"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="size-3.5" /> Delete
                      </Button>
                      <ConfirmDialog
                        open={deleteOpen}
                        onOpenChange={setDeleteOpen}
                        title={`Delete ${current.name}?`}
                        description="The list and every item on it are removed for good, and any link you shared stops working. Products themselves are not affected."
                        confirmLabel="Delete list"
                        onConfirm={() => void deleteCurrentList()}
                        pending={remove.isPending}
                      />
                    </>
                  )}
                </div>

                {/* ------------------------------------------------ sharing */}
                <div className="mt-3 rounded-lg border border-[var(--brand-line)] p-3">
                  <p className="flex items-center gap-1.5 text-xs font-medium">
                    <Share2 className="size-3.5" aria-hidden /> Share this list
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    Anyone with the link sees the items and matching products. They cannot see your
                    account, addresses or other lists, and cannot edit it.
                  </p>
                  {shareUrl ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <input
                        readOnly
                        value={shareUrl}
                        aria-label="Share link"
                        className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-[11px]"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-10"
                        onClick={() =>
                          void navigator.clipboard
                            ?.writeText(shareUrl)
                            .then(() => toast.success("Link copied"))
                            .catch(() => toast.error("Could not copy. Select the link instead."))
                        }
                      >
                        <Copy className="size-3.5" /> Copy
                      </Button>
                      <Button asChild size="sm" variant="outline" className="h-10">
                        <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                          <Link2 className="size-3.5" /> Open
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-10"
                        disabled={rotate.isPending}
                        onClick={() =>
                          void rotate
                            .mutateAsync(current.id)
                            .then(() =>
                              toast.success("New link created. The old one no longer works."),
                            )
                            .catch((error: unknown) =>
                              toast.error(
                                error instanceof Error
                                  ? error.message
                                  : "Could not reset the link.",
                              ),
                            )
                        }
                      >
                        <RotateCcw className="size-3.5" /> Reset
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-10"
                        onClick={() =>
                          void share
                            .mutateAsync({ id: current.id, enabled: false })
                            .then(() => toast.success("Sharing is off"))
                            .catch((error: unknown) =>
                              toast.error(
                                error instanceof Error ? error.message : "Could not stop sharing.",
                              ),
                            )
                        }
                      >
                        Stop sharing
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-8"
                      onClick={() =>
                        void share
                          .mutateAsync({ id: current.id, enabled: true })
                          .then(() => toast.success("Sharing is on"))
                          .catch((error: unknown) =>
                            toast.error(
                              error instanceof Error ? error.message : "Could not share.",
                            ),
                          )
                      }
                    >
                      Turn sharing on
                    </Button>
                  )}
                </div>

                {/* ------------------------------------------------ add item */}
                <div className="mt-3 rounded-lg border border-[var(--brand-line)] p-3">
                  <div className="flex flex-wrap gap-2">
                    <Input
                      value={itemName}
                      onChange={(event) => setItemName(event.target.value)}
                      placeholder="Add an item by name"
                      aria-label="Item name"
                      maxLength={160}
                      className="h-10 min-w-0 flex-1"
                    />
                    <Input
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                      inputMode="decimal"
                      aria-label="Quantity"
                      className="tnum h-10 w-20"
                    />
                    <Button
                      className="h-10"
                      disabled={addItem.isPending || itemName.trim().length === 0}
                      onClick={() =>
                        void addItem
                          .mutateAsync({
                            name: itemName,
                            quantity: Math.max(0.001, Number(quantity) || 1),
                          })
                          .then(() => {
                            setItemName("");
                            setQuantity("1");
                            toast.success("Added");
                          })
                          .catch((error: unknown) =>
                            toast.error(
                              error instanceof Error ? error.message : "Could not add the item.",
                            ),
                          )
                      }
                    >
                      <Plus className="size-4" /> Add
                    </Button>
                  </div>

                  <div className="relative mt-2">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Find a real product to add instead"
                      aria-label="Search marketplace products"
                      className="h-9 pl-9 text-sm"
                    />
                  </div>
                  {searchFeed.isFetching ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">Searching…</p>
                  ) : results.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {results.map((item) => (
                        <li key={item.id} className="flex items-center gap-2 rounded-md px-1 py-1">
                          <div className="size-8 shrink-0 overflow-hidden rounded bg-[var(--brand-surface)]">
                            {marketImageUrl(item.image_path) ? (
                              <img
                                src={marketImageUrl(item.image_path) ?? ""}
                                alt=""
                                className="size-full object-cover"
                              />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">{item.name}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {item.shop_name} · {formatMoney(item.price, item.currency)}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            disabled={addItem.isPending}
                            onClick={() =>
                              void addItem
                                .mutateAsync({
                                  name: item.name,
                                  listingId: item.id,
                                  productId: item.product_id,
                                  quantity: 1,
                                })
                                .then(() => toast.success(`${item.name} added`))
                                .catch((error: unknown) =>
                                  toast.error(
                                    error instanceof Error
                                      ? error.message
                                      : "Could not add the product.",
                                  ),
                                )
                            }
                          >
                            Add
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : debounced.trim() ? (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      No published product matches that yet. You can still add it by name.
                    </p>
                  ) : null}
                </div>

                {/* ------------------------------------------------ items */}
                {current.items.length === 0 ? (
                  <p className="mt-4 text-sm text-muted-foreground">
                    This list is empty. Add a name, or search for a real product.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {current.items.map((item) => (
                      <li
                        key={item.id}
                        className={cn(
                          "rounded-lg border p-3",
                          item.resolved
                            ? "border-[var(--brand-line)] opacity-60"
                            : "border-[var(--brand-line)]",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {Number(item.quantity)} × {item.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {item.resolved
                                ? "Marked as gathered"
                                : item.candidates.length === 0
                                  ? "No matching product published right now"
                                  : `${item.candidates.length} seller option${item.candidates.length === 1 ? "" : "s"}`}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              aria-pressed={item.resolved}
                              aria-label={
                                item.resolved ? "Mark as still needed" : "Mark as gathered"
                              }
                              className="press grid size-10 place-items-center rounded-md border border-[var(--brand-line)]"
                              onClick={() =>
                                void updateItem
                                  .mutateAsync({ id: item.id, patch: { resolved: !item.resolved } })
                                  .catch((error: unknown) =>
                                    toast.error(
                                      error instanceof Error
                                        ? error.message
                                        : "Could not update the item.",
                                    ),
                                  )
                              }
                            >
                              <Check className="size-4" aria-hidden />
                            </button>
                            <button
                              type="button"
                              aria-label="Remove item"
                              className="press grid size-10 place-items-center rounded-md border border-[var(--brand-line)]"
                              onClick={() =>
                                void removeItem
                                  .mutateAsync(item.id)
                                  .catch((error: unknown) =>
                                    toast.error(
                                      error instanceof Error
                                        ? error.message
                                        : "Could not remove the item.",
                                    ),
                                  )
                              }
                            >
                              <X className="size-4" aria-hidden />
                            </button>
                          </div>
                        </div>

                        {item.candidates.length > 0 ? (
                          <ul className="mt-2 divide-y divide-[var(--brand-line)] border-t border-[var(--brand-line)]">
                            {item.candidates.map((candidate) => (
                              <CandidateRow
                                key={candidate.listing_id}
                                candidate={candidate}
                                quantity={Number(item.quantity) || 1}
                                onAdded={(label) => toast.success(label)}
                              />
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Each seller fulfils their own items, so a list that spans shops becomes separate
                  orders — one per seller — rather than one pretend transaction.
                </p>
              </>
            ) : null}
          </section>
        </div>
      </PageContainer>
    </MarketShell>
  );
}

/** One real listing that could satisfy a requested item. */
function CandidateRow({
  candidate,
  quantity,
  onAdded,
}: {
  candidate: ListCandidate;
  quantity: number;
  onAdded: (label: string) => void;
}) {
  const outOfStock = candidate.stock_state === "out";
  const href = `/shop/${candidate.shop_slug}/p/${candidate.listing_id}`;

  return (
    <li className="flex items-center gap-2 py-1.5">
      <div className="size-9 shrink-0 overflow-hidden rounded bg-[var(--brand-surface)]">
        {marketImageUrl(candidate.image_path) ? (
          <img
            src={marketImageUrl(candidate.image_path) ?? ""}
            alt=""
            className="size-full object-cover"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{candidate.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {candidate.shop_name} · {formatMoney(candidate.price, candidate.currency)}
          {outOfStock
            ? " · out of stock"
            : candidate.max_quantity < quantity
              ? ` · ${candidate.max_quantity} left`
              : ""}
        </p>
      </div>
      {outOfStock ? (
        <span className="shrink-0 text-[11px] text-muted-foreground">Unavailable</span>
      ) : (
        <Button asChild size="sm" variant="outline" className="h-7 shrink-0">
          <Link to={href} onClick={() => onAdded(`Opening ${candidate.name}`)}>
            View
          </Link>
        </Button>
      )}
    </li>
  );
}
