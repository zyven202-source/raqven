import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Archive,
  MoreVertical,
  PackagePlus,
  Pencil,
  Plus,
  ScanLine,
  Search,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";
import { ProductFormDialog } from "@/components/app/ProductFormDialog";
import { StockMoveSheet, type StockMoveMode } from "@/components/app/StockMoveSheet";
import { StorageImage } from "@/components/app/StorageImage";
import { BarcodeScannerSheet } from "@/components/pos/BarcodeScannerSheet";
import {
  MetricCard,
  SectionLabel,
  StatusBadge,
  stockStatus,
  stockStatusLabel,
} from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  useCategories,
  useDeleteProduct,
  useProducts,
  useUpdateProduct,
} from "@/hooks/useProducts";
import { formatMoney } from "@/lib/format";
import { PhotoBanner } from "@/components/app/PhotoBanner";
import { PHOTOGRAPHY } from "@/lib/photography";
import { STORAGE_BUCKETS, type Product } from "@/types/savo";

export const Route = createFileRoute("/_authenticated/app/inventory")({
  // `q` is the deep-link prefill: SAVO Pulse's restock actions open this
  // screen already searching for the product they named. Typing in the box
  // does NOT write it back to the URL — this is a one-way inbound link, not
  // history spam.
  validateSearch: (search: Record<string, unknown>): { q?: string | undefined } => ({
    q: typeof search["q"] === "string" ? search["q"] : undefined,
  }),
  head: () => ({ meta: [{ title: "SAVO — Inventory" }] }),
  component: InventoryPage,
});

/**
 * The stock catalogue.
 *
 * Each row is built for recognition rather than browsing: what it is, how many
 * are on the shelf, what it sells for, what it cost, and whether it needs
 * reordering. Status comes from the product's own quantity and low-stock
 * threshold, both read from the database — nothing here is estimated.
 */
function InventoryPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";

  const { q } = Route.useSearch();
  const [search, setSearch] = useState(q ?? "");
  // One-way sync: a deep link (or a new one while mounted) prefills the box.
  useEffect(() => {
    if (q !== undefined) setSearch(q);
  }, [q]);
  const [categoryId, setCategoryId] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [stockTarget, setStockTarget] = useState<{ product: Product; mode: StockMoveMode } | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [newBarcode, setNewBarcode] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 250);
  const productsQuery = useProducts({
    shopId,
    search: debouncedSearch || undefined,
    categoryId: categoryId || undefined,
    lowStockOnly,
    includeArchived,
    limit: 200,
  });
  const categories = useCategories(shopId);
  const updateProduct = useUpdateProduct(shopId);
  const deleteProduct = useDeleteProduct(shopId);

  const products = productsQuery.data ?? [];
  const filtered = Boolean(debouncedSearch || categoryId || lowStockOnly || includeArchived);

  // Figures for the rows this screen actually loaded (up to 200). They are sums
  // of real columns — quantity and buying price — not a forecast of anything.
  const unitsOnShelf = products.reduce((sum, product) => sum + Number(product.quantity), 0);
  const stockAtCost = products.reduce(
    (sum, product) => sum + Number(product.quantity) * Number(product.buying_price),
    0,
  );
  const needsAttention = products.filter(
    (product) => Number(product.quantity) <= Number(product.low_stock_threshold),
  ).length;
  // The catalogue query loads at most 200 products; say so rather than let a
  // larger shop believe these totals cover all of it.
  const atLimit = products.length >= 200;
  const scopeHint = filtered ? "In this view" : atLimit ? "First 200 loaded" : "In the catalogue";

  async function handleArchiveToggle(product: Product) {
    const nextActive = !product.is_active;
    try {
      await updateProduct.mutateAsync({ id: product.id, patch: { isActive: nextActive } });
      toast.success(nextActive ? `${product.name} is back on sale` : `${product.name} archived`, {
        description: nextActive
          ? "It is available at the till again."
          : "It keeps its history but no longer appears at the till.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the product.");
    }
  }

  async function handleDelete(product: Product) {
    try {
      await deleteProduct.mutateAsync(product.id);
      toast.success(`${product.name} deleted`);
      setDeleteTarget(null);
    } catch (error) {
      setDeleteTarget(null);
      toast.error(error instanceof Error ? error.message : "Could not delete the product.", {
        duration: 8000,
      });
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Inventory"
        title="Stock"
        subtitle="What is on the shelf, what it cost, and what needs reordering."
        action={
          <Button
            className="h-10"
            onClick={() => {
              setEditing(null);
              setNewBarcode(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" /> Add
          </Button>
        }
      />

      {products.length > 0 ? (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MetricCard label="Products" value={products.length} hint={scopeHint} />
          <MetricCard label="Units" value={unitsOnShelf} hint="On the shelf" />
          <MetricCard
            label="At cost"
            value={formatMoney(stockAtCost, currency)}
            hint={atLimit ? "First 200 loaded" : "What the shelves hold"}
            className="col-span-2 sm:col-span-1"
          />
        </div>
      ) : null}

      <PhotoBanner
        photo={PHOTOGRAPHY.stock}
        caption="What is on the shelf, at a glance."
        className="mb-3"
      />

      {/* ------------------------------------------------------------ search */}
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
              placeholder="Search name or barcode"
              aria-label="Search products"
              className="h-12 pl-9"
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>
          <Button
            type="button"
            className="size-12 shrink-0"
            onClick={() => setScannerOpen(true)}
            aria-label="Scan a barcode to add a product"
          >
            <ScanLine className="size-5" />
          </Button>
        </div>

        <div className="flex gap-2">
          <Select
            value={categoryId || "all"}
            onValueChange={(value) => setCategoryId(value === "all" ? "" : value)}
          >
            <SelectTrigger className="h-10 min-w-0 flex-1" aria-label="Filter by category">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(categories.data ?? []).map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant={lowStockOnly ? "default" : "outline"}
            className="h-10 shrink-0"
            aria-pressed={lowStockOnly}
            onClick={() => setLowStockOnly((value) => !value)}
          >
            <TriangleAlert className="size-4" /> Low
          </Button>

          <Button
            type="button"
            variant={includeArchived ? "default" : "outline"}
            size="icon"
            className="size-10 shrink-0"
            aria-label="Show archived products"
            aria-pressed={includeArchived}
            onClick={() => setIncludeArchived((value) => !value)}
          >
            <Archive className="size-4" />
          </Button>
        </div>
      </div>

      {/* ---------------------------------------------------------- products */}
      <div className="mt-1">
        {needsAttention > 0 && !lowStockOnly ? (
          <button
            type="button"
            onClick={() => setLowStockOnly(true)}
            className="press mb-3 flex w-full items-center justify-between gap-3 rounded-xl border border-caution/30 bg-caution-soft/50 px-3.5 py-2.5 text-left text-sm"
          >
            <span className="flex items-center gap-2">
              <TriangleAlert className="size-4 shrink-0 text-caution" aria-hidden />
              <span>
                <span className="font-medium">
                  {needsAttention} product{needsAttention === 1 ? "" : "s"}
                </span>{" "}
                at or below the reorder level
              </span>
            </span>
            <span className="shrink-0 text-xs font-semibold text-caution">Show</span>
          </button>
        ) : null}

        {productsQuery.isLoading ? (
          <LoadingState label="Loading your stock…" />
        ) : productsQuery.isError ? (
          <ErrorState
            message={productsQuery.error.message}
            onRetry={() => void productsQuery.refetch()}
          />
        ) : products.length === 0 ? (
          <EmptyState
            title={filtered ? "Nothing matches" : "No products yet"}
            description={
              filtered
                ? "Clear the filters to see the rest of your catalogue."
                : "Add your first product to start selling and tracking stock."
            }
            action={
              filtered ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setCategoryId("");
                    setLowStockOnly(false);
                    setIncludeArchived(false);
                  }}
                >
                  <SlidersHorizontal className="size-4" /> Clear filters
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setEditing(null);
                    setNewBarcode(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="size-4" /> Add a product
                </Button>
              )
            }
          />
        ) : (
          <>
            <SectionLabel
              action={
                <span className="tnum text-xs text-muted-foreground">
                  {products.length} product{products.length === 1 ? "" : "s"}
                </span>
              }
            >
              {filtered ? "Matching stock" : "Catalogue"}
            </SectionLabel>
            <ul className="list-divided">
              {products.map((product) => {
                const quantity = Number(product.quantity);
                const threshold = Number(product.low_stock_threshold);
                const tone = stockStatus(quantity, threshold);

                return (
                  <li key={product.id} className="flex items-start gap-3 py-3">
                    <StorageImage
                      bucket={STORAGE_BUCKETS.productImages}
                      path={product.image_url}
                      alt={`${product.name} — product photo`}
                      className="size-12 shrink-0 rounded-md"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate text-sm font-medium">{product.name}</p>
                        {!product.is_active ? <StatusBadge>Archived</StatusBadge> : null}
                      </div>

                      {/* The two numbers a shopkeeper checks first, side by side. */}
                      <p className="tnum mt-1 text-sm">
                        <span className="font-semibold">{quantity}</span>
                        <span className="text-muted-foreground"> {product.unit} in stock</span>
                        <span className="mx-1.5 text-muted-foreground">·</span>
                        <span className="font-medium">
                          sells {formatMoney(product.selling_price, currency)}
                        </span>
                      </p>
                      <p className="tnum mt-0.5 text-xs text-muted-foreground">
                        cost {formatMoney(product.buying_price, currency)}
                        {product.barcode ? ` · ${product.barcode}` : ""}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <StatusBadge tone={tone}>
                          {stockStatusLabel(quantity, threshold)}
                        </StatusBadge>
                        {tone === "caution" ? (
                          <span className="tnum text-[11px] text-muted-foreground">
                            Threshold: {threshold}
                          </span>
                        ) : null}
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => setStockTarget({ product, mode: "in" })}
                        >
                          <PackagePlus className="size-3.5" /> Restock
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => {
                            setEditing(product);
                            setNewBarcode(null);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="size-3.5" /> Edit
                        </Button>
                      </div>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-9 shrink-0"
                          aria-label={`More actions for ${product.name}`}
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onSelect={() => setStockTarget({ product, mode: "in" })}>
                          <PackagePlus /> Add stock
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setStockTarget({ product, mode: "count" })}
                        >
                          <SlidersHorizontal /> Record a count
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => setStockTarget({ product, mode: "damage" })}
                        >
                          <TriangleAlert /> Record loss
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setEditing(product);
                            setNewBarcode(null);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil /> Edit product
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => void handleArchiveToggle(product)}>
                          <Archive /> {product.is_active ? "Archive" : "Restore"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => setDeleteTarget(product)}
                        >
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>

            <Link
              to="/app/stock"
              search={{ shop: undefined }}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink"
            >
              See every stock movement
            </Link>
          </>
        )}
      </div>

      <BarcodeScannerSheet
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={(code) => {
          setScannerOpen(false);
          setEditing(null);
          setNewBarcode(code);
          setFormOpen(true);
        }}
        onManualSubmit={(code) => {
          setScannerOpen(false);
          setEditing(null);
          setNewBarcode(code);
          setFormOpen(true);
        }}
      />

      <ProductFormDialog
        shopId={shopId}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditing(null);
            setNewBarcode(null);
          }
        }}
        product={editing}
        initialBarcode={newBarcode}
      />

      <StockMoveSheet
        shopId={shopId}
        product={stockTarget?.product ?? null}
        mode={stockTarget?.mode ?? "in"}
        open={stockTarget !== null}
        onOpenChange={(open) => {
          if (!open) setStockTarget(null);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={`Delete ${deleteTarget?.name ?? "product"}?`}
        description="Deleting is only allowed while the product has no sales or stock history. Otherwise archive it so the record survives."
        confirmLabel="Delete product"
        onConfirm={() => deleteTarget && void handleDelete(deleteTarget)}
      />
    </PageContainer>
  );
}
