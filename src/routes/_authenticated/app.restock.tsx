import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PackagePlus, Search, TriangleAlert } from "lucide-react";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { StockMoveSheet } from "@/components/app/StockMoveSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useProducts } from "@/hooks/useProducts";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/ravqen";

export const Route = createFileRoute("/_authenticated/app/restock")({
  head: () => ({ meta: [{ title: "Restock — RAVQEN" }] }),
  component: RestockPage,
});

function RestockPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";

  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(true);
  const [target, setTarget] = useState<Product | null>(null);

  const debounced = useDebouncedValue(search, 250);
  const productsQuery = useProducts({
    shopId,
    search: debounced || undefined,
    lowStockOnly: lowOnly,
    limit: 200,
  });

  const products = productsQuery.data ?? [];

  return (
    <PageContainer className="pb-28">
      <PageHeader
        title="Restock"
        subtitle="Add what came in from the supplier. Every addition is booked to the ledger."
      />

      <div className="mt-4 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a product"
            className="h-12 pl-9"
            autoComplete="off"
          />
        </div>
        <Button
          type="button"
          variant={lowOnly ? "default" : "outline"}
          className="h-10"
          onClick={() => setLowOnly((value) => !value)}
        >
          <TriangleAlert /> {lowOnly ? "Showing low stock only" : "Show all products"}
        </Button>
      </div>

      <div className="mt-4">
        {productsQuery.isPending ? (
          <LoadingState label="Loading products…" />
        ) : productsQuery.isError ? (
          <ErrorState
            message={productsQuery.error.message}
            onRetry={() => void productsQuery.refetch()}
          />
        ) : products.length === 0 ? (
          <EmptyState
            title={lowOnly ? "Nothing is running low" : "No products yet"}
            description={
              lowOnly
                ? "Switch off the low-stock filter to restock anything else."
                : "Add products from the Stock screen first."
            }
            action={
              <Link to="/app/inventory" search={{ shop: undefined }}>
                <Button variant="outline">Open the catalogue</Button>
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {products.map((product) => (
              <li key={product.id} className="surface-panel flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{product.name}</p>
                  <p
                    className={cn(
                      "text-xs",
                      product.is_low_stock ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {Number(product.quantity)} {product.unit} in stock · buy{" "}
                    {formatMoney(product.buying_price, currency)}
                    {product.is_low_stock ? " · below the low-stock level" : ""}
                  </p>
                </div>
                <Button className="h-10 shrink-0" onClick={() => setTarget(product)}>
                  <PackagePlus /> Add
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <StockMoveSheet
        shopId={shopId}
        product={target}
        mode="in"
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      />
    </PageContainer>
  );
}
