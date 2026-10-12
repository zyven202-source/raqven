import { useEffect, useState } from "react";
import { Loader2, Plus, ScanLine } from "lucide-react";
import { toast } from "sonner";

import { Field, MoneyField, QuantityField } from "@/components/app/fields";
import { StorageImage } from "@/components/app/StorageImage";
import { BarcodeScannerSheet } from "@/components/pos/BarcodeScannerSheet";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveShop } from "@/hooks/useActiveShop";
import {
  useCategories,
  useCreateCategory,
  useCreateProduct,
  useUpdateProduct,
} from "@/hooks/useProducts";
import { uploadImage } from "@/services/storage.service";
import { STORAGE_BUCKETS, type Product } from "@/types/savo";

const UNITS = ["pc", "kg", "g", "ltr", "ml", "pack", "crate", "dozen", "metre"];

/**
 * Add or edit a product.
 *
 * Opening stock is not written into the product row: it is booked through the
 * `record_stock_movement` path so the very first unit already has a ledger
 * entry explaining it. The barcode can be typed, pasted, or scanned — scanning
 * is the fast path, never the only path.
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
  const { activeShop } = useActiveShop();
  const currency = activeShop?.currency ?? "KES";
  const categories = useCategories(shopId);
  const createProduct = useCreateProduct(shopId);
  const updateProduct = useUpdateProduct(shopId);
  const createCategory = useCreateCategory(shopId);

  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [unit, setUnit] = useState("pc");
  const [buyingPrice, setBuyingPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [openingQuantity, setOpeningQuantity] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("5");
  const [newCategory, setNewCategory] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  // Reset whenever the dialog opens so a previous edit never leaks into a new one.
  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? "");
    setBarcode(product?.barcode ?? initialBarcode ?? "");
    setCategoryId(product?.category_id ?? "");
    setUnit(product?.unit ?? "pc");
    setBuyingPrice(product ? String(product.buying_price) : "");
    setSellingPrice(product ? String(product.selling_price) : "");
    setOpeningQuantity("");
    setLowStockThreshold(product ? String(product.low_stock_threshold) : "5");
    setNewCategory("");
    setImageFile(null);
    setImagePath(product?.image_url ?? null);
    setErrors({});
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
      toast.error(error instanceof Error ? error.message : "The photo could not be uploaded.");
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

    const next: Record<string, string | undefined> = {};
    if (name.trim().length < 2) next["name"] = "Give the product a name.";
    if (!Number.isFinite(buying) || buying < 0) next["buyingPrice"] = "Zero or more.";
    if (!Number.isFinite(selling) || selling <= 0) {
      next["sellingPrice"] = "Enter a selling price above zero.";
    }
    if (!Number.isFinite(threshold) || threshold < 0) next["lowStockThreshold"] = "Zero or more.";
    if (!editing && (!Number.isFinite(opening) || opening < 0)) {
      next["openingQuantity"] = "Zero or more.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    try {
      if (editing && product) {
        await updateProduct.mutateAsync({
          id: product.id,
          patch: {
            name: name.trim(),
            barcode: barcode.trim() || null,
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
          name: name.trim(),
          barcode: barcode.trim() || null,
          categoryId: categoryId || null,
          unit,
          buyingPrice: buying,
          sellingPrice: selling,
          lowStockThreshold: threshold,
          imageUrl: imagePath,
          openingQuantity: opening,
        });
        toast.success(`${created.name} added`, {
          description:
            opening > 0
              ? `${opening} ${unit} recorded as opening stock.`
              : "Add stock from the Stock screen to start selling it.",
        });
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "The product could not be saved.";
      setErrors({ ["form"]: message });
      toast.error(message, { duration: 8000 });
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto px-5 pb-8 pt-5">
          <SheetHeader className="text-left">
            <SheetTitle className="text-base">
              {editing ? "Edit product" : "Add a product"}
            </SheetTitle>
            <SheetDescription className="text-sm">
              {editing
                ? "Change the details. Stock levels are changed from the Stock screen so every movement keeps a reason."
                : "Opening stock is recorded as a delivery, so your stock count adds up from day one."}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
            <Field label="Product name" error={errors["name"]} htmlFor="product-name">
              <Input
                id="product-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setErrors((c) => ({ ...c, name: undefined }));
                }}
                placeholder="e.g. Coca-Cola 500ml"
                className="h-12"
                autoComplete="off"
                autoFocus={!editing}
              />
            </Field>

            <Field
              label="Barcode"
              hint="Scan it, or type it. Leave blank if the product has none."
              htmlFor="product-barcode"
            >
              <div className="flex gap-2">
                <Input
                  id="product-barcode"
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                  placeholder="e.g. 5449000000996"
                  inputMode="numeric"
                  className="tnum h-12 flex-1"
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="size-12 shrink-0"
                  onClick={() => setScannerOpen(true)}
                  aria-label="Scan the barcode"
                >
                  <ScanLine className="size-5" />
                </Button>
              </div>
            </Field>

            <Field
              label="Category"
              hint="Optional, but it makes searching faster."
              htmlFor="product-category"
            >
              <Select
                value={categoryId || "none"}
                onValueChange={(value) => setCategoryId(value === "none" ? "" : value)}
              >
                <SelectTrigger id="product-category" className="h-12">
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
            </Field>

            <div className="flex gap-2">
              <Input
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
                placeholder="Or add a new category"
                className="h-11 flex-1"
                autoComplete="off"
              />
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0"
                onClick={() => void handleAddCategory()}
                disabled={!newCategory.trim() || createCategory.isPending}
              >
                {createCategory.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Add
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <MoneyField
                id="product-buying"
                label="Buying price"
                hint="What you pay."
                error={errors["buyingPrice"]}
                value={buyingPrice}
                onChange={setBuyingPrice}
                currency={currency}
              />
              <MoneyField
                id="product-selling"
                label="Selling price"
                hint="What you charge."
                error={errors["sellingPrice"]}
                value={sellingPrice}
                onChange={setSellingPrice}
                currency={currency}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {!editing ? (
                <QuantityField
                  id="product-opening"
                  label="Opening stock"
                  hint="On the shelf today."
                  error={errors["openingQuantity"]}
                  value={openingQuantity}
                  onChange={setOpeningQuantity}
                  unit={unit}
                />
              ) : null}
              <QuantityField
                id="product-low"
                label="Reorder at"
                hint="Warn me below this."
                error={errors["lowStockThreshold"]}
                value={lowStockThreshold}
                onChange={setLowStockThreshold}
                unit={unit}
              />
            </div>

            <Field label="Sold by" hint="How this product is counted." htmlFor="product-unit">
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger id="product-unit" className="h-12">
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
            </Field>

            <Field
              label="Photo"
              hint="Optional. Helps staff recognise it at the till."
              htmlFor="product-image"
            >
              <div className="flex items-center gap-3">
                {imagePath || imageFile ? (
                  <StorageImage
                    bucket={STORAGE_BUCKETS.productImages}
                    path={imagePath}
                    alt={name.trim() ? `Photo of ${name.trim()}` : "Product photo"}
                    className="size-12 shrink-0 rounded-md"
                  />
                ) : null}
                <Input
                  id="product-image"
                  type="file"
                  accept="image/*"
                  className="h-12"
                  onChange={(event) => void handleImage(event.target.files?.[0] ?? null)}
                />
              </div>
              {imageFile && uploading ? (
                <p className="text-xs text-muted-foreground">Uploading the photo…</p>
              ) : null}
            </Field>

            {errors["form"] ? (
              <p className="rounded-lg border border-negative/30 bg-negative-soft/60 px-3.5 py-2.5 text-sm text-negative">
                {errors["form"]}
              </p>
            ) : null}

            <Button type="submit" className="h-12 w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {editing ? "Save changes" : "Add product"}
            </Button>
          </form>
        </SheetContent>
      </Sheet>

      <BarcodeScannerSheet
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={(code) => {
          setBarcode(code);
          setScannerOpen(false);
          toast.success("Barcode captured", { description: code });
        }}
        onManualSubmit={(code) => {
          setBarcode(code);
          setScannerOpen(false);
        }}
      />
    </>
  );
}
