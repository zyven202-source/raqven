import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { StorageImage } from "@/components/app/StorageImage";
import { Field } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { usePublishListing } from "@/hooks/useMarketlink";
import {
  copyProductImage,
  marketImageUrl,
  type ListingWithProduct,
} from "@/services/marketlink.service";
import { STORAGE_BUCKETS, type Product } from "@/types/savo";

/**
 * Publishing is where a listing stops being an inventory row and becomes a shop
 * window. Two things are deliberately strict:
 *
 *   - No image, no publish. The button stays disabled and the database refuses
 *     the write as well.
 *   - The price starts at the product's current selling price, and may be left
 *     blank — blank means "follow inventory", so a later price change at the
 *     till is visible on the marketplace without editing the listing.
 */
export function ListingDialog({
  shopId,
  product,
  listing,
  open,
  onOpenChange,
}: {
  shopId: string;
  product: Product | null;
  listing: ListingWithProduct | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const publish = usePublishListing(shopId);
  const fileInput = useRef<HTMLInputElement>(null);

  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPrice(
      listing?.public_price !== null && listing?.public_price !== undefined
        ? String(listing.public_price)
        : "",
    );
    setDescription(listing?.description ?? "");
    setCategory(listing?.category ?? "");
    setFile(null);
    setImagePath(listing?.image_path ?? null);
    setPreview(listing?.image_path ? marketImageUrl(listing.image_path) : null);
  }, [open, listing]);

  // Object URLs hold a blob alive; revoke the previous one whenever it changes.
  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  if (!product) return null;

  const canPublish = Boolean(file || imagePath);

  function chooseFile(next: File | null) {
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      toast.error("Choose a photo (JPEG, PNG or WebP).");
      return;
    }
    if (next.size > 5 * 1024 * 1024) {
      toast.error("That photo is larger than 5 MB. Choose a smaller one.");
      return;
    }
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setImagePath(null);
  }

  async function copyInventoryPhoto() {
    if (!product?.image_url) return;
    setCopying(true);
    try {
      const copied = await copyProductImage(shopId, product.image_url);
      setImagePath(copied);
      setFile(null);
      setPreview(marketImageUrl(copied));
      toast.success("Using the product photo from your inventory.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That photo could not be used.");
    } finally {
      setCopying(false);
    }
  }

  async function save(isPublished: boolean) {
    const parsed = price.trim() === "" ? null : Number(price);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      toast.error("Enter a public price of zero or more, or leave it blank.");
      return;
    }
    try {
      await publish.mutateAsync({
        shopId,
        productId: product!.id,
        description: description.trim() || null,
        publicPrice: parsed,
        category: category.trim() || null,
        file,
        imagePath,
        isPublished,
      });
      toast.success(
        isPublished ? `${product!.name} is on Marketlink` : `${product!.name} saved as hidden`,
      );
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The listing could not be saved.");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] overflow-y-auto border-[var(--brand-line)] bg-[var(--brand-raised)] pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:mx-auto sm:max-w-lg sm:rounded-t-2xl"
      >
        <SheetHeader>
          <SheetTitle>{listing ? "Edit listing" : "Publish to Marketlink"}</SheetTitle>
          <SheetDescription>
            {product.name} · {product.quantity} {product.unit} in stock
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">Product photo</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              A real photo of this product. Customers see exactly this image.
            </p>
            <div className="mt-2 flex gap-3">
              <div className="size-24 shrink-0 overflow-hidden rounded-lg border border-[var(--brand-line)] bg-[var(--brand-surface)]">
                {preview ? (
                  <img src={preview} alt="" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-muted-foreground">
                    <ImagePlus className="size-6" aria-hidden />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full"
                  onClick={() => fileInput.current?.click()}
                >
                  <ImagePlus className="size-4" /> Choose a photo
                </Button>
                {product.image_url ? (
                  <div className="flex items-center gap-2">
                    <StorageImage
                      bucket={STORAGE_BUCKETS.productImages}
                      path={product.image_url}
                      alt=""
                      className="size-8 shrink-0 rounded"
                    />
                    <button
                      type="button"
                      onClick={() => void copyInventoryPhoto()}
                      disabled={copying}
                      className="press text-xs font-medium text-[var(--brand-primary)] underline-offset-4 hover:underline"
                    >
                      {copying ? "Copying…" : "Use the inventory photo"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            {!canPublish ? (
              <p className="mt-2 rounded-md border border-caution/30 bg-caution-soft/50 px-2.5 py-1.5 text-[11px] text-caution">
                A product cannot be published without an uploaded photo.
              </p>
            ) : null}
          </div>

          <Field
            label="Public price"
            hint="Leave blank to follow the product's selling price automatically."
            htmlFor="listing-price"
          >
            <Input
              id="listing-price"
              inputMode="decimal"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder={`${product.selling_price}`}
              className="tnum h-11"
            />
          </Field>

          <Field
            label="Description"
            hint="Optional. Customers read this on the listing."
            htmlFor="listing-desc"
          >
            <textarea
              id="listing-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              maxLength={1200}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </Field>

          <Field
            label="Category"
            hint="Optional. Helps customers browse the marketplace."
            htmlFor="listing-category"
          >
            <Input
              id="listing-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-11"
              placeholder="Groceries"
            />
          </Field>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1"
              disabled={publish.isPending || !canPublish}
              onClick={() => void save(false)}
            >
              Save hidden
            </Button>
            <Button
              type="button"
              className="h-11 flex-1"
              disabled={publish.isPending || !canPublish}
              onClick={() => void save(true)}
            >
              {publish.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Publish
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
