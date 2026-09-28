import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  Banknote,
  CreditCard,
  Minus,
  Plus,
  ScanLine,
  Search,
  ShoppingCart,
  Smartphone,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState, PageContainer } from "@/components/app/AppChrome";
import { ProductFormDialog } from "@/components/app/ProductFormDialog";
import { ReceiptSheet } from "@/components/app/ReceiptSheet";
import { BarcodeScannerSheet } from "@/components/pos/BarcodeScannerSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActiveShop } from "@/hooks/useActiveShop";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useProducts } from "@/hooks/useProducts";
import { useCreateSale } from "@/hooks/useSales";
import { cartTotals, type CartLineInput } from "@/services/sales.service";
import { findProductByBarcode } from "@/services/products.service";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import type { PaymentMethod, Product } from "@/types/ravqen";

export const Route = createFileRoute("/_authenticated/app/pos")({
  head: () => ({ meta: [{ title: "POS — RAVQEN" }] }),
  component: PosPage,
});

interface CartLine extends CartLineInput {
  name: string;
  unit: string;
  available: number;
}

function parseAmount(value: string) {
  const numeric = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

const PAYMENT_OPTIONS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "mpesa", label: "M-Pesa", icon: Smartphone },
  { value: "card", label: "Card", icon: CreditCard },
  { value: "credit", label: "Credit", icon: TriangleAlert },
];

function PosPage() {
  const { activeShop } = useActiveShop();
  const shopId = activeShop?.id ?? "";
  const currency = activeShop?.currency ?? "KES";

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 250);

  const productsQuery = useProducts({ shopId, search: debouncedSearch || undefined, limit: 60 });
  // Going through the hook matters: a completed sale invalidates the stock,
  // ledger and debtor caches, so the till cannot keep selling stale quantities.
  const createSaleMutation = useCreateSale(shopId);

  const [lines, setLines] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [discount, setDiscount] = useState("");
  const [tendered, setTendered] = useState("");
  const [debtorName, setDebtorName] = useState("");
  const [debtorPhone, setDebtorPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receiptSaleId, setReceiptSaleId] = useState<string | null>(null);
  const [missingBarcode, setMissingBarcode] = useState<string | null>(null);

  const discountAmount = parseAmount(discount);
  const totals = useMemo(() => cartTotals(lines, discountAmount), [lines, discountAmount]);
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const tenderedAmount = parseAmount(tendered);
  const changeDue = paymentMethod === "cash" ? Math.max(tenderedAmount - totals.total, 0) : 0;

  const addToCart = useCallback((product: Product, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      const available = Number(product.quantity);

      if (existing) {
        if (existing.quantity + quantity > available) {
          toast.error(`Only ${available} ${product.unit} of ${product.name} in stock.`);
          return current;
        }
        return current.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + quantity } : line,
        );
      }

      if (available < quantity) {
        toast.error(`${product.name} is out of stock.`);
        return current;
      }

      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit,
          available,
          quantity,
          unitPrice: Number(product.selling_price),
          discountAmount: 0,
        },
      ];
    });
  }, []);

  const setLineQuantity = (productId: string, quantity: number) => {
    setLines((current) =>
      current.flatMap((line) => {
        if (line.productId !== productId) return [line];
        if (quantity <= 0) return [];
        if (quantity > line.available) {
          toast.error(`Only ${line.available} ${line.unit} available.`);
          return [line];
        }
        return [{ ...line, quantity }];
      }),
    );
  };

  const removeLine = (productId: string) => {
    setLines((current) => current.filter((line) => line.productId !== productId));
  };

  /** Barcode scan or manual entry — one lookup path for both. */
  const handleBarcode = useCallback(
    async (barcode: string) => {
      if (!shopId) return;
      try {
        const product = await findProductByBarcode(shopId, barcode);
        if (!product) {
          setScannerOpen(false);
          setMissingBarcode(barcode);
          toast.error("Product not found", {
            description: `No product in this shop uses barcode ${barcode}.`,
          });
          return;
        }
        addToCart(product);
        setScannerOpen(false);
        toast.success(`${product.name} added`, {
          description: `${formatMoney(product.selling_price, currency)} · ${product.quantity} ${product.unit} in stock`,
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The barcode lookup failed.");
      }
    },
    [shopId, addToCart, currency],
  );

  function resetCart() {
    setLines([]);
    setDiscount("");
    setTendered("");
    setDebtorName("");
    setDebtorPhone("");
    setPaymentMethod("cash");
  }

  async function completeSale() {
    if (!shopId || lines.length === 0) return;

    if (paymentMethod === "credit" && !debtorName.trim()) {
      toast.error("A credit sale needs the debtor's name.");
      return;
    }
    if (paymentMethod === "cash" && tenderedAmount < totals.total) {
      toast.error("Cash received is less than the total.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await createSaleMutation.mutateAsync({
        shopId,
        lines: lines.map(({ productId, quantity, unitPrice, discountAmount: lineDiscount }) => ({
          productId,
          quantity,
          unitPrice,
          discountAmount: lineDiscount,
        })),
        paymentMethod,
        amountTendered:
          paymentMethod === "cash" ? tenderedAmount : paymentMethod === "credit" ? 0 : totals.total,
        discountAmount: totals.discount,
        debtorName: paymentMethod === "credit" ? debtorName : null,
        debtorPhone: paymentMethod === "credit" ? debtorPhone : null,
      });

      setCartOpen(false);
      resetCart();
      setReceiptSaleId(result.saleId);

      if (result.changeDue > 0) {
        toast.success(`Give ${formatMoney(result.changeDue, currency)} change`);
      } else if (result.balanceDue > 0) {
        toast.success(`Sale recorded · ${formatMoney(result.balanceDue, currency)} on credit`);
      } else {
        toast.success(`Sale recorded · ${result.receiptNumber}`);
      }
    } catch (error) {
      // The database refused it — surface the real reason (insufficient stock,
      // cash below total, access denied) instead of a generic failure.
      toast.error("Sale could not be completed", {
        description: error instanceof Error ? error.message : "Unknown error",
        duration: 8000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!activeShop) return <LoadingState label="Opening your shop…" />;

  return (
    <PageContainer className="pb-40">
      <div className="sticky top-14 z-20 -mx-4 mb-3 bg-background/95 px-4 pb-3 pt-3 backdrop-blur-sm sm:-mx-6 sm:px-6">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              className="h-12 pl-9"
              autoComplete="off"
              enterKeyHint="search"
            />
          </div>
          <Button
            type="button"
            className="h-12 w-12 shrink-0"
            onClick={() => setScannerOpen(true)}
            aria-label="Scan a barcode"
          >
            <ScanLine />
          </Button>
        </div>
      </div>

      {productsQuery.isPending ? (
        <LoadingState label="Loading your products…" />
      ) : productsQuery.isError ? (
        <ErrorState
          message={productsQuery.error.message}
          onRetry={() => void productsQuery.refetch()}
        />
      ) : (productsQuery.data ?? []).length === 0 ? (
        <EmptyState
          title={debouncedSearch ? "No product matches that search" : "No products yet"}
          description={
            debouncedSearch
              ? "Try a different word, or scan the barcode."
              : "Add your first product from the Stock screen and it will appear here for sale."
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {(productsQuery.data ?? []).map((product) => {
            const out = Number(product.quantity) <= 0;
            return (
              <button
                key={product.id}
                type="button"
                disabled={out}
                onClick={() => addToCart(product)}
                className={cn(
                  "surface-panel flex min-h-[86px] flex-col justify-between p-3 text-left transition-colors",
                  out ? "opacity-50" : "active:bg-secondary",
                )}
              >
                <span className="line-clamp-2 text-sm font-medium leading-snug">
                  {product.name}
                </span>
                <span className="mt-2 flex items-end justify-between gap-1">
                  <span className="font-semibold">
                    {formatMoney(product.selling_price, currency)}
                  </span>
                  <span
                    className={cn(
                      "text-[11px]",
                      product.is_low_stock ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {out ? "Out" : `${Number(product.quantity)} ${product.unit}`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Till bar: always shows what is in the cart and the running total. */}
      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {itemCount === 0 ? "No items yet" : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
            </p>
            <p className="text-lg font-semibold leading-tight">
              {formatMoney(totals.total, currency)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={() => setCartOpen(true)}
            disabled={lines.length === 0}
          >
            <ShoppingCart /> Cart
          </Button>
          <Button
            type="button"
            className="h-12 px-6"
            onClick={() => setCartOpen(true)}
            disabled={lines.length === 0}
          >
            Charge
          </Button>
        </div>
      </div>

      <BarcodeScannerSheet
        open={scannerOpen}
        onOpenChange={setScannerOpen}
        onDetected={(code) => void handleBarcode(code)}
        onManualSubmit={(code) => void handleBarcode(code)}
      />

      <ProductFormDialog
        shopId={shopId}
        open={missingBarcode !== null}
        onOpenChange={(open) => {
          if (!open) setMissingBarcode(null);
        }}
        initialBarcode={missingBarcode}
      />

      <ReceiptSheet
        saleId={receiptSaleId}
        open={receiptSaleId !== null}
        onOpenChange={(open) => {
          if (!open) setReceiptSaleId(null);
        }}
        onNewSale={() => setSearch("")}
      />

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto px-4 pb-8 pt-4">
          <SheetHeader className="px-0 pb-3 text-left">
            <SheetTitle className="text-base">Current sale</SheetTitle>
          </SheetHeader>

          {lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">The cart is empty.</p>
          ) : (
            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.productId} className="surface-panel p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{line.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatMoney(line.unitPrice, currency)} · {line.available} {line.unit} in
                        stock
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeLine(line.productId)}
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary"
                      aria-label={`Remove ${line.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-10"
                        onClick={() => setLineQuantity(line.productId, line.quantity - 1)}
                        aria-label="Decrease"
                      >
                        <Minus />
                      </Button>
                      <span className="w-10 text-center font-semibold">{line.quantity}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-10"
                        onClick={() => setLineQuantity(line.productId, line.quantity + 1)}
                        aria-label="Increase"
                      >
                        <Plus />
                      </Button>
                    </div>
                    <span className="font-semibold">
                      {formatMoney(line.quantity * line.unitPrice, currency)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="pos-discount">Discount (optional)</Label>
              <Input
                id="pos-discount"
                value={discount}
                onChange={(event) => setDiscount(event.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="h-11"
                autoComplete="off"
              />
            </div>

            <div className="surface-panel space-y-1 p-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Items</span>
                <span>{formatMoney(totals.itemsTotal, currency)}</span>
              </div>
              {totals.discount > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span>-{formatMoney(totals.discount, currency)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatMoney(totals.total, currency)}</span>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Payment method</p>
              <div className="grid grid-cols-4 gap-2">
                {PAYMENT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPaymentMethod(option.value)}
                    className={cn(
                      "flex h-16 flex-col items-center justify-center gap-1 rounded-xl border text-[11px] font-medium",
                      paymentMethod === option.value
                        ? "border-primary bg-primary/5 text-ink"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    <option.icon className="size-4" />
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {paymentMethod === "cash" ? (
              <div className="space-y-1.5">
                <Label htmlFor="pos-tendered">Cash received</Label>
                <Input
                  id="pos-tendered"
                  value={tendered}
                  onChange={(event) => setTendered(event.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className="h-12 text-lg"
                  autoComplete="off"
                />
                <p className="text-sm">
                  {tenderedAmount >= totals.total ? (
                    <span className="font-medium">Change {formatMoney(changeDue, currency)}</span>
                  ) : (
                    <span className="text-destructive">
                      Still {formatMoney(totals.total - tenderedAmount, currency)} short
                    </span>
                  )}
                </p>
              </div>
            ) : null}

            {paymentMethod === "credit" ? (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="pos-debtor">Debtor name</Label>
                  <Input
                    id="pos-debtor"
                    value={debtorName}
                    onChange={(event) => setDebtorName(event.target.value)}
                    placeholder="e.g. Jane Wanjiru"
                    className="h-11"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pos-debtor-phone">Phone (optional)</Label>
                  <Input
                    id="pos-debtor-phone"
                    value={debtorPhone}
                    onChange={(event) => setDebtorPhone(event.target.value)}
                    inputMode="tel"
                    placeholder="0712 345 678"
                    className="h-11"
                    autoComplete="off"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  The full {formatMoney(totals.total, currency)} is recorded as owed. This sale will
                  not be marked as paid.
                </p>
              </div>
            ) : null}

            <Button
              className="h-12 w-full text-base"
              disabled={lines.length === 0 || submitting}
              onClick={() => void completeSale()}
            >
              {submitting ? "Recording…" : `Complete sale · ${formatMoney(totals.total, currency)}`}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
