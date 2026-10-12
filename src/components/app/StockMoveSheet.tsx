import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MoneyField, QuantityField } from "@/components/app/fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRecordDamage, useRecordStockCount, useRecordStockIn } from "@/hooks/useInventory";
import { formatMoney } from "@/lib/format";
import type { Product } from "@/types/savo";

export type StockMoveMode = "in" | "count" | "damage";

const COPY: Record<
  StockMoveMode,
  { title: string; label: string; hint: string; action: string; empty: string }
> = {
  in: {
    title: "Receive stock",
    label: "How many did you receive?",
    hint: "This is added to what you already have.",
    action: "Add to stock",
    empty: "Enter how many units arrived.",
  },
  count: {
    title: "Record a stock count",
    label: "How many are on the shelf?",
    hint: "Count what is physically there. Any difference is booked automatically.",
    action: "Save count",
    empty: "Enter what you counted.",
  },
  damage: {
    title: "Record stock lost",
    label: "How many were lost?",
    hint: "Broken, spoiled or stolen. This is taken off your stock.",
    action: "Record loss",
    empty: "Enter how many were lost.",
  },
};

/**
 * Every stock change goes through one of these three modes, and all three call
 * the `record_stock_movement` RPC — nothing here writes `products.quantity`, so
 * the ledger always explains why the number moved.
 */
export function StockMoveSheet({
  shopId,
  product,
  mode,
  currency = "KES",
  open,
  onOpenChange,
}: {
  shopId: string;
  product: Product | null;
  mode: StockMoveMode;
  currency?: string;
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

  // Show the resulting figure before the user commits — the single most useful
  // thing on the sheet.
  const current = product ? Number(product.quantity) : 0;
  const after =
    mode === "in"
      ? current + (Number.isFinite(numeric) ? numeric : 0)
      : mode === "damage"
        ? current - (Number.isFinite(numeric) ? numeric : 0)
        : Number.isFinite(numeric)
          ? numeric
          : current;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!product || !valid) {
      toast.error(copy.empty);
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
        toast.success(`${product.name} is now at ${Number(result.quantity)} ${product.unit}`);
      } else if (mode === "count") {
        const result = await stockCount.mutateAsync({
          productId: product.id,
          countedQuantity: numeric,
          notes: notes || "Stock count",
        });
        toast.success(
          `Count saved — ${product.name} is now at ${Number(result.quantity)} ${product.unit}`,
        );
      } else {
        const result = await damage.mutateAsync({
          productId: product.id,
          quantity: numeric,
          notes: notes || "Lost or damaged",
        });
        toast.success(
          `Loss recorded — ${product.name} is now at ${Number(result.quantity)} ${product.unit}`,
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
      <SheetContent side="bottom" className="px-5 pb-8 pt-5">
        <SheetHeader className="text-left">
          <SheetTitle className="text-base">{copy.title}</SheetTitle>
        </SheetHeader>

        {product ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-sunken px-3.5 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{product.name}</p>
              <p className="tnum mt-0.5 text-xs text-muted-foreground">
                {current} {product.unit} now · reorders at {Number(product.low_stock_threshold)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[11px] text-muted-foreground">After this</p>
              <p
                className={
                  "tnum text-lg font-semibold " +
                  (after < 0
                    ? "text-negative"
                    : after <= Number(product.low_stock_threshold)
                      ? "text-caution"
                      : "text-positive")
                }
              >
                {after} {product.unit}
              </p>
            </div>
          </div>
        ) : null}

        <form onSubmit={submit} className="mt-5 space-y-4">
          <QuantityField
            id="stock-quantity"
            label={copy.label}
            hint={copy.hint}
            value={quantity}
            onChange={setQuantity}
            unit={product?.unit ?? ""}
          />

          {mode === "in" ? (
            <MoneyField
              id="stock-cost"
              label="Buying price each"
              hint="Kept with this delivery so your profit stays accurate."
              value={unitCost}
              onChange={setUnitCost}
              currency={currency}
            />
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="stock-notes" className="block text-sm font-medium">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="stock-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={mode === "in" ? "e.g. Delivery from Makkah" : "e.g. Broken crate"}
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
