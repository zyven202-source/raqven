import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { StorageImage } from "@/components/app/StorageImage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCategories,
  useCreateCategory,
  useCreateProduct,
  useUpdateProduct,
} from "@/hooks/useProducts";
import { uploadImage } from "@/services/storage.service";
import { STORAGE_BUCKETS, type Product } from "@/types/ravqen";

const UNITS = ["pc", "kg", "g", "ltr", "ml", "pack", "crate", "dozen", "metre"];

/**
 * Add or edit a product.
 *
 * Opening stock is not written into the product row: it is booked through the
 * `record_stock_movement` RPC so the very first unit already has a ledger entry
 * explaining it.
 */
export function ProductFormDialog({
  shopId,
  open,
  onOpenChange,
  product,
  initialBarcode,
  onCreated,
}: {
  shopId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing; absent when creating. */
  product?: Product | null;
  /** Pre-fills the barcode field — used by the "barcode not found" flow. */
  initialBarcode?: string | null;
  onCreated?: (product: Product) => void;
}) {
  const editing = Boolean(product);
  const categories = useCategories(shopId);
  const createProduct = useCreateProduct(shopId);
  const updateProduct = useUpdateProduct(shopId);
  const createCategory = useCreateCategory(shopId);

  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [sku, setSku] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [unit, setUnit] = useState("pc");
  const [buyingPrice, setBuyingPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [openingQuantity, setOpeningQuantity] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("5");
  const [newCategory, setNewCategory] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Reset whenever the dialog opens so a previous edit never leaks into a new one.
  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? "");
    setBarcode(product?.barcode ?? initialBarcode ?? "");
    setSku(product?.sku ?? "");
    setCategoryId(product?.category_id ?? "");
    setUnit(product?.unit ?? "pc");
    setBuyingPrice(product ? String(product.buying_price) : "");
    setSellingPrice(product ? String(product.selling_price) : "");
    setOpeningQuantity("");
    setLowStockThreshold(product ? String(product.low_stock_threshold) : "5");
    setNewCategory("");
    setImageFile(null);
    setImagePath(product?.image_url ?? null);
  }, [open, product, initialBarcode]);

  const busy = createProduct.isPending || updateProduct.isPending || uploading;

  async function handleImage(file: File | null) {
    setImageFile(file);
    if (!file) return;
    setUploading(true);
    try {
      const path = await uploadImage(STORAGE_BUCKETS.productImages, shopId, file);
      setImagePath(path);
    } catch (error) {
      setImageFile(null);
      toast.error(error instanceof Error ? error.message : "The image could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  async function handleAddCategory() {
    const label = newCategory.trim();
    if (!label) return;
    try {
      const created = await createCategory.mutateAsync({ name: label });
      setCategoryId(created.id);
      setNewCategory("");
      toast.success(`Category “${created.name}” added`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the category.");
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    const buying = Number(buyingPrice || 0);
    const selling = Number(sellingPrice || 0);
    const threshold = Number(lowStockThreshold || 0);
    const opening = Number(openingQuantity || 0);

    if (name.trim().length < 2) {
      toast.error("Give the product a name.");
      return;
    }
    if (!Number.isFinite(buying) || buying < 0) {
      toast.error("The buying price must be zero or more.");
      return;
    }
    if (!Number.isFinite(selling) || selling <= 0) {
      toast.error("Enter a selling price above zero.");
      return;
    }
    if (!Number.isFinite(threshold) || threshold < 0) {
      toast.error("The low-stock level must be zero or more.");
      return;
    }
    if (!editing && (!Number.isFinite(opening) || opening < 0)) {
      toast.error("Opening stock must be zero or more.");
      return;
    }

    try {
      if (editing && product) {
        await updateProduct.mutateAsync({
          id: product.id,
          patch: {
            name,
            barcode: barcode.trim() || null,
            sku: sku.trim() || null,
            categoryId: categoryId || null,
            unit,
            buyingPrice: buying,
            sellingPrice: selling,
            lowStockThreshold: threshold,
            imageUrl: imagePath,
          },
        });
        toast.success("Product updated");
      } else {
        const created = await createProduct.mutateAsync({
          shopId,
          name,
          barcode: barcode.trim() || null,
          sku: sku.trim() || null,
          categoryId: categoryId || null,
          unit,
          buyingPrice: buying,
          sellingPrice: selling,
          lowStockThreshold: threshold,
          imageUrl: imagePath,
          openingQuantity: opening,
        });
        toast.success("Product added", {
          description: opening > 0 ? `Opening stock of ${opening} ${unit} recorded.` : undefined,
        });
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The product could not be saved.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit product" : "Add a product"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Stock changes are recorded from the Stock screens, so the ledger stays complete."
              : "Opening stock is written as a stock movement, so every unit has a reason."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="product-name">Name</Label>
            <Input
              id="product-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Coca-Cola 500ml"
              className="h-11"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-barcode">Barcode (optional)</Label>
            <Input
              id="product-barcode"
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              placeholder="Scan or type"
              inputMode="numeric"
              className="h-11 font-mono"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-category">Category (optional)</Label>
            <div className="flex gap-2">
              <Select
                value={categoryId || "none"}
                onValueChange={(value) => setCategoryId(value === "none" ? "" : value)}
              >
                <SelectTrigger id="product-category" className="h-11 flex-1">
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {(categories.data ?? []).map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2">
              <Input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="New category"
                className="h-10"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => void handleAddCategory()}
                disabled={!newCategory.trim() || createCategory.isPending}
              >
                {createCategory.isPending ? <Loader2 className="animate-spin" /> : <Plus />} Add
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="product-buying">Buying price</Label>
              <Input
                id="product-buying"
                value={buyingPrice}
                onChange={(event) => setBuyingPrice(event.target.value)}
                inputMode="decimal"
                placeholder="60"
                className="h-11"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-selling">Selling price</Label>
              <Input
                id="product-selling"
                value={sellingPrice}
                onChange={(event) => setSellingPrice(event.target.value)}
                inputMode="decimal"
                placeholder="100"
                className="h-11"
                autoComplete="off"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!editing ? (
              <div className="space-y-1.5">
                <Label htmlFor="product-opening">Opening stock</Label>
                <Input
                  id="product-opening"
                  value={openingQuantity}
                  onChange={(event) => setOpeningQuantity(event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className="h-11"
                  autoComplete="off"
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="product-low">Low-stock level</Label>
              <Input
                id="product-low"
                value={lowStockThreshold}
                onChange={(event) => setLowStockThreshold(event.target.value)}
                inputMode="decimal"
                className="h-11"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-unit">Unit</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger id="product-unit" className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-image">Photo (optional)</Label>
            <div className="flex items-center gap-3">
              {imagePath ? (
                <StorageImage
                  bucket={STORAGE_BUCKETS.productImages}
                  path={imagePath}
                  alt={name || "Product"}
                  className="size-14"
                />
              ) : null}
              <Input
                id="product-image"
                type="file"
                accept="image/*"
                className="h-11"
                onChange={(event) => void handleImage(event.target.files?.[0] ?? null)}
              />
            </div>
            {imageFile && uploading ? (
              <p className="text-xs text-muted-foreground">Uploading…</p>
            ) : null}
            {imageFile && !uploading && imagePath ? (
              <p className="text-xs text-muted-foreground">Photo uploaded.</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="submit" className="h-12 w-full sm:w-auto" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {editing ? "Save changes" : "Add product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
