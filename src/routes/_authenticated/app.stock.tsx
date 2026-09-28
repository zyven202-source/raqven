import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, SlidersHorizontal, TriangleAlert } from "lucide-react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useMovements } from "@/hooks/useInventory";
import { useProducts } from "@/hooks/useProducts";
import { formatDateTime, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MovementType } from "@/types/ravqen";

export const Route = createFileRoute("/_authenticated/app/stock")({
  head: () => ({ meta: [{ title: "Stock ledger — RAVQEN" }] }),
  component: StockLedgerPage,
});

const MOVEMENT_COPY: Record<MovementType, { label: string; tone: "in" | "out" | "flat" }> = {
  opening: { label: "Opening stock", tone: "in" },
  stock_in: { label: "Stock in", tone: "in" },
  sale: { label: "Sale", tone: "out" },
  refund: { label: "Refund restock", tone: "in" },
  adjustment: { label: "Adjustment", tone: "flat" },
  damage: { label: "Damage", tone: "out" },
  transfer: { label: "Transfer", tone: "flat" },
};

function StockLedgerPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";

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

  return (
    <PageContainer>
      <PageHeader
        title="Stock ledger"
        subtitle="Every quantity change, with who recorded it and why."
      />
      <p className="mt-2 text-sm text-muted-foreground">
        Looking for a product?{" "}
        <Link
          to="/app/inventory"
          search={{ shop: undefined }}
          className="text-ink-soft underline-offset-4 hover:underline"
        >
          Open the catalogue
        </Link>
        .
      </p>

      <div className="mt-5">
        {movementsQuery.isPending ? (
          <LoadingState label="Loading the ledger…" />
        ) : movementsQuery.isError ? (
          <ErrorState
            message={movementsQuery.error.message}
            onRetry={() => void movementsQuery.refetch()}
          />
        ) : (movementsQuery.data ?? []).length === 0 ? (
          <EmptyState
            title="No stock movements yet"
            description="Add a product with opening stock, or restock an existing one, and the ledger starts here."
          />
        ) : (
          <ul className="space-y-2">
            {(movementsQuery.data ?? []).map((movement) => {
              const copy = MOVEMENT_COPY[movement.movement_type];
              const product = productNames.get(movement.product_id);
              const quantity = Number(movement.quantity);

              return (
                <li key={movement.id} className="surface-panel flex items-start gap-3 p-3">
                  <span
                    className={cn(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                      copy.tone === "in"
                        ? "bg-primary/10 text-ink"
                        : copy.tone === "out"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-secondary text-muted-foreground",
                    )}
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
                    {movement.reference_type === "sale" || movement.reference_type === "refund" ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        From a {movement.reference_type}
                      </p>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-sm font-semibold",
                        quantity > 0 ? "text-ink" : "text-destructive",
                      )}
                    >
                      {quantity > 0 ? "+" : ""}
                      {quantity} {product?.unit ?? ""}
                    </p>
                    {movement.balance_after !== null ? (
                      <p className="text-[11px] text-muted-foreground">
                        now {Number(movement.balance_after)}
                      </p>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      {formatMoney(Number(movement.unit_cost ?? 0), currency)}
                    </p>
                  </div>

                  {movement.movement_type === "damage" ? (
                    <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
