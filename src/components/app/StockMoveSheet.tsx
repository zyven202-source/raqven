import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRecordDamage, useRecordStockCount, useRecordStockIn } from "@/hooks/useInventory";
import type { Product } from "@/types/ravqen";

export type StockMoveMode = "in" | "count" | "damage";

const COPY: Record<StockMoveMode, { title: string; label: string; hint: string; action: string }> =
  {
    in: {
      title: "Add stock",
      label: "Quantity received",
      hint: "Booked as a stock-in movement against this product.",
      action: "Add stock",
    },
    count: {
      title: "Record a stock count",
      label: "Counted quantity",
      hint: "The difference between this count and the system figure is written to the ledger as an adjustment.",
      action: "Save count",
    },
    damage: {
      title: "Record stock lost",
      label: "Quantity lost",
      hint: "Booked as a damage movement and removed from stock.",
      action: "Record loss",
    },
  };

/**
 * Every stock change goes through one of these three modes, and all three call
 * the `record_stock_movement` RPC — nothing here writes `products.quantity`.
 */
export function StockMoveSheet({
  shopId,
  product,
  mode,
  open,
  onOpenChange,
}: {
  shopId: string;
  product: Product | null;
  mode: StockMoveMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const stockIn = useRecordStockIn(shopId);
  const stockCount = useRecordStockCount(shopId);
  const damage = useRecordDamage(shopId);

  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setNotes("");
    setUnitCost(product ? String(product.buying_price) : "");
    // A count starts from what the system currently believes.
    setQuantity(mode === "count" && product ? String(product.quantity) : "");
  }, [open, mode, product]);

  const copy = COPY[mode];
  const busy = stockIn.isPending || stockCount.isPending || damage.isPending;
  const numeric = Number(quantity.replace(/[^0-9.]/g, ""));
  const valid = Number.isFinite(numeric) && (mode === "count" ? numeric >= 0 : numeric > 0);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!product || !valid) {
      toast.error(copy.hint);
      return;
    }

    try {
      if (mode === "in") {
        const result = await stockIn.mutateAsync({
          productId: product.id,
          quantity: numeric,
          unitCost: unitCost ? Number(unitCost) : null,
          notes: notes || null,
        });
        toast.success(`${product.name} now at ${Number(result.quantity)} ${product.unit}`);
      } else if (mode === "count") {
        const result = await stockCount.mutateAsync({
          productId: product.id,
          countedQuantity: numeric,
          notes: notes || "Stock count",
        });
        toast.success(
          `Count saved — ${product.name} now at ${Number(result.quantity)} ${product.unit}`,
        );
      } else {
        const result = await damage.mutateAsync({
          productId: product.id,
          quantity: numeric,
          notes: notes || "Damaged",
        });
        toast.success(
          `Loss recorded — ${product.name} now at ${Number(result.quantity)} ${product.unit}`,
        );
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The stock change was refused.", {
        duration: 8000,
      });
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="px-4 pb-8 pt-4">
        <SheetHeader className="px-0 pb-3 text-left">
          <SheetTitle className="text-base">{copy.title}</SheetTitle>
        </SheetHeader>

        {product ? (
          <div className="surface-panel mb-4 p-3">
            <p className="text-sm font-medium">{product.name}</p>
            <p className="text-xs text-muted-foreground">
              Currently {Number(product.quantity)} {product.unit} · low-stock level{" "}
              {Number(product.low_stock_threshold)}
            </p>
          </div>
        ) : null}

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="stock-quantity">{copy.label}</Label>
            <Input
              id="stock-quantity"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              inputMode="decimal"
              className="h-12 text-lg"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">{copy.hint}</p>
          </div>

          {mode === "in" ? (
            <div className="space-y-1.5">
              <Label htmlFor="stock-cost">Buying price per unit</Label>
              <Input
                id="stock-cost"
                value={unitCost}
                onChange={(event) => setUnitCost(event.target.value)}
                inputMode="decimal"
                className="h-11"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Recorded on the movement, so the cost of this batch is kept.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="stock-notes">Note (optional)</Label>
            <Input
              id="stock-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={mode === "in" ? "e.g. Supplier delivery" : "e.g. Broken crate"}
              className="h-11"
              autoComplete="off"
            />
          </div>

          <Button type="submit" className="h-12 w-full" disabled={busy || !valid}>
            {busy ? "Saving…" : copy.action}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
