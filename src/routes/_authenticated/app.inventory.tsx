import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowDownUp,
  Boxes,
  MoreVertical,
  PackagePlus,
  Pencil,
  Plus,
  Search,
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
import { cn } from "@/lib/utils";
import { STORAGE_BUCKETS, type Product } from "@/types/ravqen";

export const Route = createFileRoute("/_authenticated/app/inventory")({
  head: () => ({ meta: [{ title: "Stock — RAVQEN" }] }),
  component: InventoryPage,
});

function InventoryPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [stockTarget, setStockTarget] = useState<{ product: Product; mode: StockMoveMode } | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

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

  async function handleArchiveToggle(product: Product) {
    const nextActive = !product.is_active;
    try {
      await updateProduct.mutateAsync({ id: product.id, patch: { isActive: nextActive } });
      toast.success(nextActive ? `${product.name} restored` : `${product.name} archived`, {
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
        title="Stock"
        subtitle={`${products.length} product${products.length === 1 ? "" : "s"} shown`}
        action={
          <Button
            className="h-11"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus /> Add
          </Button>
        }
      />

      <div className="mt-4 space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search name or barcode"
            className="h-12 pl-9"
            autoComplete="off"
            enterKeyHint="search"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Select
            value={categoryId || "all"}
            onValueChange={(value) => setCategoryId(value === "all" ? "" : value)}
          >
            <SelectTrigger className="h-10 w-auto min-w-[9rem] flex-1">
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
            className="h-10"
            onClick={() => setLowStockOnly((value) => !value)}
          >
            <TriangleAlert /> Low stock
          </Button>

          <Button
            type="button"
            variant={includeArchived ? "default" : "outline"}
            className="h-10"
            onClick={() => setIncludeArchived((value) => !value)}
          >
            <Boxes /> Archived
          </Button>
        </div>

        <Link
          to="/app/stock"
          search={{ shop: undefined }}
          className="inline-flex items-center gap-1.5 text-sm text-ink-soft underline-offset-4 hover:underline"
        >
          <ArrowDownUp className="size-4" /> View the stock movement ledger
        </Link>
      </div>

      <div className="mt-4">
        {productsQuery.isPending ? (
          <LoadingState label="Loading your stock…" />
        ) : productsQuery.isError ? (
          <ErrorState
            message={productsQuery.error.message}
            onRetry={() => void productsQuery.refetch()}
          />
        ) : products.length === 0 ? (
          <EmptyState
            title={
              debouncedSearch || lowStockOnly ? "Nothing matches those filters" : "No products yet"
            }
            description={
              debouncedSearch || lowStockOnly
                ? "Clear the filters to see the rest of your catalogue."
                : "Add your first product to start selling and tracking stock."
            }
            action={
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus /> Add a product
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2.5">
            {products.map((product) => (
              <li key={product.id} className="surface-panel flex items-center gap-3 p-3">
                <StorageImage
                  bucket={STORAGE_BUCKETS.productImages}
                  path={product.image_url}
                  alt={product.name}
                  className="size-12 shrink-0"
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(product.selling_price, currency)} sell ·{" "}
                    {formatMoney(product.buying_price, currency)} buy
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-xs font-medium",
                      product.is_low_stock ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {Number(product.quantity)} {product.unit} in stock
                    {product.is_low_stock ? " · low" : ""}
                    {product.is_active ? "" : " · archived"}
                  </p>
                </div>

                <Button
                  size="icon"
                  variant="outline"
                  className="size-10 shrink-0"
                  aria-label={`Add stock for ${product.name}`}
                  onClick={() => setStockTarget({ product, mode: "in" })}
                >
                  <PackagePlus />
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-10 shrink-0"
                      aria-label="More actions"
                    >
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem onSelect={() => setStockTarget({ product, mode: "in" })}>
                      <PackagePlus /> Add stock
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setStockTarget({ product, mode: "count" })}>
                      <Boxes /> Record a count
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setStockTarget({ product, mode: "damage" })}>
                      <TriangleAlert /> Record loss
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setEditing(product);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil /> Edit product
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void handleArchiveToggle(product)}>
                      <Boxes /> {product.is_active ? "Archive" : "Restore"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => setDeleteTarget(product)}
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProductFormDialog
        shopId={shopId}
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
        product={editing}
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
