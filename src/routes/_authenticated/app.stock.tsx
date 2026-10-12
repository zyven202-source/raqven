import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, SlidersHorizontal } from "lucide-react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { SectionLabel } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useMovements } from "@/hooks/useInventory";
import { useProducts } from "@/hooks/useProducts";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MovementType } from "@/types/savo";

export const Route = createFileRoute("/_authenticated/app/stock")({
  head: () => ({ meta: [{ title: "SAVO — Stock movements" }] }),
  component: StockLedgerPage,
});

const MOVEMENT_COPY: Record<MovementType, { label: string; tone: "in" | "out" | "flat" }> = {
  opening: { label: "Opening stock", tone: "in" },
  stock_in: { label: "Stock received", tone: "in" },
  sale: { label: "Sold", tone: "out" },
  refund: { label: "Returned to shelf", tone: "in" },
  adjustment: { label: "Count adjustment", tone: "flat" },
  damage: { label: "Lost or damaged", tone: "out" },
  transfer: { label: "Transfer", tone: "flat" },
};

/**
 * The stock ledger: every quantity change, in order, with the reason and who
 * recorded it. This is the screen that answers "why does my stock say that?".
 */
function StockLedgerPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";

  const [filter, setFilter] = useState<"all" | "in" | "out">("all");

  const movementsQuery = useMovements({ shopId, limit: 150 });
  // The ledger shows a product name; products are narrow and the map keeps the
  // list independent of PostgREST relationship inference.
  const productsQuery = useProducts({ shopId, includeArchived: true, limit: 300 });

  const productNames = useMemo(() => {
    const map = new Map<string, { name: string; unit: string }>();
    for (const product of productsQuery.data ?? []) {
      map.set(product.id, { name: product.name, unit: product.unit });
    }
    return map;
  }, [productsQuery.data]);

  const movements = (movementsQuery.data ?? []).filter((movement) => {
    if (filter === "all") return true;
    return MOVEMENT_COPY[movement.movement_type].tone === filter;
  });

  return (
    <PageContainer>
      <PageHeader
        title="Stock movements"
        subtitle="Every quantity change, and why it happened."
        action={
          <Button variant="outline" className="h-10" asChild>
            <Link to="/app/restock" search={{ shop: undefined }}>
              Receive
            </Link>
          </Button>
        }
      />

      <div className="mb-3 flex gap-2">
        {(
          [
            { value: "all", label: "Everything" },
            { value: "in", label: "Added" },
            { value: "out", label: "Removed" },
          ] as const
        ).map((option) => (
          <Button
            key={option.value}
            variant={filter === option.value ? "secondary" : "outline"}
            className="h-9 flex-1 text-xs"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>

      {movementsQuery.isLoading ? (
        <LoadingState label="Loading the ledger…" />
      ) : movementsQuery.isError ? (
        <ErrorState
          message={movementsQuery.error.message}
          onRetry={() => void movementsQuery.refetch()}
        />
      ) : movements.length === 0 ? (
        <EmptyState
          title={filter === "all" ? "No stock movements yet" : "Nothing in this group"}
          description={
            filter === "all"
              ? "Add a product with opening stock, or receive a delivery, and the ledger starts here."
              : "Switch back to Everything to see the rest."
          }
        />
      ) : (
        <>
          <SectionLabel>
            {movements.length} movement{movements.length === 1 ? "" : "s"}
          </SectionLabel>
          <ul className="list-divided">
            {movements.map((movement) => {
              const copy = MOVEMENT_COPY[movement.movement_type];
              const product = productNames.get(movement.product_id);
              const quantity = Number(movement.quantity);

              return (
                <li key={movement.id} className="flex items-start gap-3 py-3">
                  <span
                    className={cn(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-md",
                      copy.tone === "in"
                        ? "bg-positive-soft text-positive"
                        : copy.tone === "out"
                          ? "bg-negative-soft text-negative"
                          : "bg-sunken text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    {copy.tone === "in" ? (
                      <ArrowUpRight className="size-4" />
                    ) : copy.tone === "out" ? (
                      <ArrowDownRight className="size-4" />
                    ) : (
                      <SlidersHorizontal className="size-4" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {product?.name ?? "Product removed"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {copy.label} · {formatDateTime(movement.created_at)}
                    </p>
                    {movement.notes ? (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {movement.notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "tnum text-sm font-semibold",
                        quantity > 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      {quantity > 0 ? "+" : ""}
                      {quantity} {product?.unit ?? ""}
                    </p>
                    {movement.balance_after !== null ? (
                      <p className="tnum text-[11px] text-muted-foreground">
                        now {Number(movement.balance_after)}
                      </p>
                    ) : null}
                    {Number(movement.unit_cost ?? 0) > 0 ? (
                      <p className="tnum text-[11px] text-muted-foreground">
                        {formatMoney(Number(movement.unit_cost), currency)}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </PageContainer>
  );
}
