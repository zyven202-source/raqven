import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PackagePlus, ScanLine, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { BarcodeScannerSheet } from "@/components/pos/BarcodeScannerSheet";
import { ProductFormDialog } from "@/components/app/ProductFormDialog";
import { StatusBadge, stockStatus, stockStatusLabel } from "@/components/app/primitives";
import { StockMoveSheet } from "@/components/app/StockMoveSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useProducts } from "@/hooks/useProducts";
import { findProductByBarcode } from "@/services/products.service";
import { formatMoney } from "@/lib/format";
import type { Product } from "@/types/savo";

export const Route = createFileRoute("/_authenticated/app/restock")({
  head: () => ({ meta: [{ title: "SAVO — Receive stock" }] }),
  component: RestockPage,
});

/**
 * Receiving a delivery.
 *
 * Scanning a barcode that already exists jumps straight to the add-stock sheet
 * for that product; an unknown barcode opens the product form with the code
 * already filled in. That is the whole point of the screen: count the box in,
 * scan it, move on.
 */
function RestockPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";

  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(true);
  const [target, setTarget] = useState<Product | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [newBarcode, setNewBarcode] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [looking, setLooking] = useState(false);

  const debounced = useDebouncedValue(search, 250);
  const productsQuery = useProducts({
    shopId,
    search: debounced || undefined,
    lowStockOnly: lowOnly,
    limit: 200,
  });

  const products = productsQuery.data ?? [];

  async function handleBarcode(code: string) {
    setScannerOpen(false);
    if (!shopId) return;
    setLooking(true);
    try {
      const product = await findProductByBarcode(shopId, code);
      if (!product) {
        setNewBarcode(code);
        setFormOpen(true);
        toast.error("Product not found", {
          description: `Nothing here uses ${code}. Add it now with the barcode already filled in.`,
        });
        return;
      }
      setTarget(product);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The barcode lookup failed.");
    } finally {
      setLooking(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader title="Receive stock" subtitle="Book in what came from the supplier." />

      <div className="sticky top-14 z-20 -mx-4 space-y-2 bg-background/95 px-4 pb-2.5 pt-1 backdrop-blur-md sm:-mx-5 sm:px-5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a product"
              aria-label="Find a product"
              className="h-12 pl-9"
              autoComplete="off"
            />
          </div>
          <Button
            type="button"
            className="size-12 shrink-0"
            onClick={() => setScannerOpen(true)}
            disabled={looking}
            aria-label="Scan a delivery barcode"
          >
            <ScanLine className="size-5" />
          </Button>
        </div>

        <Button
          type="button"
          variant={lowOnly ? "secondary" : "outline"}
          className="h-10 w-full"
          aria-pressed={lowOnly}
          onClick={() => setLowOnly((value) => !value)}
        >
          <TriangleAlert className="size-4" />
          {lowOnly ? "Showing what needs reordering" : "Showing all products"}
        </Button>
      </div>

      <div className="mt-3">
        {productsQuery.isLoading ? (
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
                ? "Everything is above its reorder level. Switch the filter off to book in stock anyway."
                : "Add your products from the Stock tab first."
            }
            action={
              <Link to="/app/inventory" search={{ shop: undefined }}>
                <Button variant="outline">Open the catalogue</Button>
              </Link>
            }
          />
        ) : (
          <ul className="list-divided">
            {products.map((product) => {
              const quantity = Number(product.quantity);
              const threshold = Number(product.low_stock_threshold);
              return (
                <li key={product.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="tnum mt-0.5 text-xs text-muted-foreground">
                      {quantity} {product.unit} in stock · buys at{" "}
                      {formatMoney(product.buying_price, currency)}
                    </p>
                    <div className="mt-1">
                      <StatusBadge tone={stockStatus(quantity, threshold)}>
                        {stockStatusLabel(quantity, threshold)}
                      </StatusBadge>
                    </div>
                  </div>
                  <Button className="h-10 shrink-0" onClick={() => setTarget(product)}>
                    <PackagePlus className="size-4" /> Add
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BarcodeScannerSheet
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        busy={looking}
        onDetected={(code) => void handleBarcode(code)}
        onManualSubmit={(code) => void handleBarcode(code)}
      />

      <ProductFormDialog
        shopId={shopId}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setNewBarcode(null);
        }}
        initialBarcode={newBarcode}
      />

      <StockMoveSheet
        shopId={shopId}
        product={target}
        currency={currency}
        mode="in"
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
      />
    </PageContainer>
  );
}
