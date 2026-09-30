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
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { EmptyState, ErrorState, LoadingState, PageContainer } from "@/components/app/AppChrome";
import { Field, MoneyField } from "@/components/app/fields";
import { StatusBadge, stockStatusLabel } from "@/components/app/primitives";
import { ProductFormDialog } from "@/components/app/ProductFormDialog";
import { ReceiptSheet } from "@/components/app/ReceiptSheet";
import { BarcodeScannerSheet } from "@/components/pos/BarcodeScannerSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  head: () => ({ meta: [{ title: "Sell — RAVQEN" }] }),
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
  { value: "credit", label: "Credit", icon: UserRound },
];

/**
 * The till.
 *
 * One job: find a product, put it in the basket, take the money, print a
 * receipt. The sale itself is written by the `create_sale` database function,
 * which does the whole thing — sale, items, payment, stock movements and any
 * debtor — or nothing at all. This screen never writes a partial sale.
 */
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

  const cashShort =
    paymentMethod === "cash" && tendered.length > 0 && tenderedAmount < totals.total;
  const creditMissing = paymentMethod === "credit" && debtorName.trim().length < 2;
  const canComplete = lines.length > 0 && !cashShort && !creditMissing && !submitting;

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
          toast.error("Barcode not recognised", {
            description: `No product in this shop uses ${barcode}. You can add it now.`,
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
        toast.success(`Sale recorded · give ${formatMoney(result.changeDue, currency)} change`);
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

  if (!activeShop) return <LoadingState label="Opening the till…" />;

  const products = productsQuery.data ?? [];

  return (
    <PageContainer className="pb-[calc(var(--glass-bar-clearance)+5.75rem)]">
      {/* ------------------------------------------------------------ search */}
      <div className="sticky top-14 z-20 -mx-4 mb-3 bg-background/95 px-4 pb-2.5 pt-2.5 backdrop-blur-md sm:-mx-5 sm:px-5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
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
            aria-label="Scan a barcode"
          >
            <ScanLine className="size-5" />
          </Button>
        </div>
      </div>

      {/* ---------------------------------------------------------- products */}
      {productsQuery.isLoading ? (
        <LoadingState label="Loading your products…" />
      ) : productsQuery.isError ? (
        <ErrorState
          message={productsQuery.error.message}
          onRetry={() => void productsQuery.refetch()}
        />
      ) : products.length === 0 ? (
        <EmptyState
          title={debouncedSearch ? "Nothing matches that search" : "No products to sell yet"}
          description={
            debouncedSearch
              ? "Try a shorter word, or scan the barcode to look it up."
              : "Add your first product from the Stock tab and it will appear here."
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {products.map((product) => {
            const quantity = Number(product.quantity);
            const out = quantity <= 0;
            const inCart = lines.find((line) => line.productId === product.id)?.quantity ?? 0;

            return (
              <button
                key={product.id}
                type="button"
                disabled={out}
                onClick={() => addToCart(product)}
                className={cn(
                  "press flex min-h-[4.75rem] flex-col justify-between rounded-lg border p-2.5 text-left",
                  out
                    ? "border-border bg-sunken opacity-60"
                    : "border-border bg-card active:bg-sunken",
                )}
              >
                <span className="line-clamp-2 text-[0.8125rem] font-medium leading-snug">
                  {product.name}
                </span>
                <span className="mt-1.5 flex items-end justify-between gap-1">
                  <span className="tnum text-sm font-semibold">
                    {formatMoney(product.selling_price, currency)}
                  </span>
                  <span className="sr-only">
                    {stockStatusLabel(quantity, Number(product.low_stock_threshold))}
                  </span>
                  <span
                    className={cn(
                      "tnum text-[11px]",
                      out
                        ? "text-negative"
                        : product.is_low_stock
                          ? "text-caution"
                          : "text-muted-foreground",
                    )}
                  >
                    {out ? "Out" : `${quantity}`}
                    {inCart > 0 ? (
                      <span className="ml-1 rounded bg-ink px-1 py-0.5 text-[10px] font-semibold text-background">
                        {inCart} in basket
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* --------------------------------------------------------- till bar */}
      {/* Sits directly above the floating navigation, using the same clearance
          token the bar was built from, so the two can never overlap. */}
      <div
        className="fixed inset-x-0 z-30 border-t border-border bg-background/97 px-4 pt-2.5 pb-3 backdrop-blur-md"
        style={{ bottom: "var(--glass-bar-clearance)" }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">
              {itemCount === 0
                ? "Basket is empty"
                : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
            </p>
            <p className="tnum text-lg font-semibold leading-tight">
              {formatMoney(totals.total, currency)}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-12 shrink-0 px-4"
            onClick={() => setCartOpen(true)}
            disabled={lines.length === 0}
            aria-label="Open the basket"
          >
            <ShoppingCart className="size-4" />
            <span className="sr-only sm:not-sr-only">Basket</span>
          </Button>
          <Button
            type="button"
            className="h-12 flex-1 text-base"
            onClick={() => setCartOpen(true)}
            disabled={lines.length === 0}
          >
            Take payment
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

      {/* ------------------------------------------------------- the basket */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto px-0 pb-6 pt-4">
          <SheetHeader className="px-5 pb-3 text-left">
            <SheetTitle className="text-base">
              Current sale
              {itemCount > 0 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {itemCount} item{itemCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </SheetTitle>
          </SheetHeader>

          {lines.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">
              Nothing in the basket yet.
            </p>
          ) : (
            <ul className="list-divided">
              {lines.map((line) => (
                <li key={line.productId} className="px-5 py-3">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{line.name}</p>
                      <p className="tnum mt-0.5 text-xs text-muted-foreground">
                        {formatMoney(line.unitPrice, currency)} each · {line.available} {line.unit}{" "}
                        in stock
                      </p>
                    </div>
                    <p className="tnum shrink-0 text-sm font-semibold">
                      {formatMoney(line.quantity * line.unitPrice, currency)}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeLine(line.productId)}
                      className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors active:bg-sunken"
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
                        aria-label={`One less ${line.name}`}
                      >
                        <Minus className="size-4" />
                      </Button>
                      <span className="tnum w-9 text-center text-base font-semibold">
                        {line.quantity}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-10"
                        onClick={() => setLineQuantity(line.productId, line.quantity + 1)}
                        aria-label={`One more ${line.name}`}
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>
                    {line.quantity >= line.available ? (
                      <StatusBadge tone="caution">All you have</StatusBadge>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-4 px-5 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <MoneyField
                id="pos-discount"
                label="Discount"
                value={discount}
                onChange={setDiscount}
                currency={currency}
                placeholder="0"
              />
              <div />
            </div>

            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <dt>Items</dt>
                <dd className="tnum">{formatMoney(totals.itemsTotal, currency)}</dd>
              </div>
              {totals.discount > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <dt>Discount</dt>
                  <dd className="tnum">− {formatMoney(totals.discount, currency)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                <dt>Total</dt>
                <dd className="tnum">{formatMoney(totals.total, currency)}</dd>
              </div>
            </dl>

            <div>
              <p className="mb-2 text-sm font-medium">How are they paying?</p>
              <div className="grid grid-cols-4 gap-1.5">
                {PAYMENT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPaymentMethod(option.value)}
                    aria-pressed={paymentMethod === option.value}
                    className={cn(
                      "press flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] font-medium",
                      paymentMethod === option.value
                        ? "border-ink bg-ink text-background"
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
              <div className="space-y-2">
                <MoneyField
                  id="pos-tendered"
                  label="Cash received"
                  value={tendered}
                  onChange={setTendered}
                  currency={currency}
                />
                {tendered.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Type what the customer handed you and RAVQEN works out the change.
                  </p>
                ) : (
                  <p
                    className={cn(
                      "tnum rounded-lg px-3 py-2 text-sm font-medium",
                      cashShort
                        ? "bg-negative-soft text-negative"
                        : "bg-positive-soft text-positive",
                    )}
                  >
                    {cashShort
                      ? `Still ${formatMoney(totals.total - tenderedAmount, currency)} short`
                      : `Change ${formatMoney(changeDue, currency)}`}
                  </p>
                )}
              </div>
            ) : null}

            {paymentMethod === "credit" ? (
              <div className="space-y-3">
                <Field
                  label="Customer name"
                  htmlFor="pos-debtor"
                  error={creditMissing ? "Required for a credit sale." : null}
                >
                  <Input
                    id="pos-debtor"
                    value={debtorName}
                    onChange={(event) => setDebtorName(event.target.value)}
                    placeholder="e.g. Jane Wanjiru"
                    className="h-11"
                    autoComplete="off"
                  />
                </Field>
                <Field label="Phone" hint="Optional" htmlFor="pos-debtor-phone">
                  <Input
                    id="pos-debtor-phone"
                    value={debtorPhone}
                    onChange={(event) => setDebtorPhone(event.target.value)}
                    inputMode="tel"
                    placeholder="0712 345 678"
                    className="h-11"
                    autoComplete="off"
                  />
                </Field>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  The full {formatMoney(totals.total, currency)} is recorded as owed. This sale is
                  not marked as paid — take repayments from the Debtors screen.
                </p>
                {/*
                  The shop is about to record a real person&rsquo;s name and phone
                  number. One line saying what happens to it, at the moment it is
                  collected, is the difference between a book the shop owns and a
                  list of people the shop was handed. It is not a consent box: it
                  is the shop telling its own customer why the shop is writing
                  this down, which is the shop&rsquo;s obligation, not a click RAVQEN
                  can collect consent for on someone else&rsquo;s behalf.
                */}
                <p className="text-xs leading-relaxed text-muted-foreground">
                  This name and number are kept as {activeShop?.name ?? "this shop"}&rsquo;s record
                  of who owes the money, visible to everyone in the shop and kept for as long as the
                  balance is outstanding. Nothing is sent anywhere and nothing is used to contact
                  them. Delete the account from Debtors once the balance is settled.
                </p>
              </div>
            ) : null}

            <Button
              className="w-full text-base"
              style={{ height: "3.25rem" }}
              disabled={!canComplete}
              onClick={() => void completeSale()}
            >
              {submitting ? "Recording…" : `Complete sale · ${formatMoney(totals.total, currency)}`}
            </Button>

            <button
              type="button"
              onClick={resetCart}
              disabled={lines.length === 0}
              className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground disabled:opacity-40"
            >
              <X className="size-3" /> Clear the basket
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </PageContainer>
  );
}
