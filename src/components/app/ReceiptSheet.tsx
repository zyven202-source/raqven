import { useState } from "react";
import { Download, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";

import { ErrorState, LoadingState } from "@/components/app/AppChrome";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useReceiptPayload } from "@/hooks/useSales";
import { useStorageUrl } from "@/hooks/useStorageUrl";
import { formatDateTime, formatMoney } from "@/lib/format";
import { receiptHtml, receiptText } from "@/lib/receipt";

/**
 * Shows a completed sale as a receipt and offers the four things a shopkeeper
 * actually needs: read it, print it, save it, send it.
 *
 * Every action is built from the stored rows, and each one reports honestly
 * when the device cannot do it (no print dialog, no share target) instead of
 * appearing to succeed.
 */
export function ReceiptSheet({
  saleId,
  open,
  onOpenChange,
  onNewSale,
}: {
  saleId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewSale?: () => void;
}) {
  const payloadQuery = useReceiptPayload(open ? saleId : null);
  const [busy, setBusy] = useState<"print" | "download" | "share" | null>(null);

  const settingsLogo = payloadQuery.data?.settings?.logo_url ?? null;
  const shopLogo = payloadQuery.data?.shop.logo_url ?? null;
  const logoUrl = useStorageUrl("shop-logos", settingsLogo ?? shopLogo);

  const payload = payloadQuery.data;
  const currency = payload?.shop.currency ?? "KES";

  function handlePrint() {
    if (!payload) return;
    setBusy("print");
    try {
      const html = receiptHtml(payload, { currency, logoUrl });
      const frame = document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.position = "fixed";
      frame.style.right = "0";
      frame.style.bottom = "0";
      frame.style.width = "0";
      frame.style.height = "0";
      frame.style.border = "0";
      frame.srcdoc = html;
      frame.onload = () => {
        const win = frame.contentWindow;
        if (!win) {
          toast.error("This browser would not open a print view. Use Download instead.");
          frame.remove();
          setBusy(null);
          return;
        }
        win.focus();
        win.print();
        // Give the print dialog a moment before tearing the frame down.
        setTimeout(() => {
          frame.remove();
          setBusy(null);
        }, 1000);
      };
      document.body.appendChild(frame);
    } catch (error) {
      setBusy(null);
      toast.error(error instanceof Error ? error.message : "Could not open the print view.");
    }
  }

  function handleDownload() {
    if (!payload) return;
    setBusy("download");
    try {
      const html = receiptHtml(payload, { currency, logoUrl });
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `receipt-${payload.sale.receipt_number}.html`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Receipt downloaded", {
        description: "Open the file and print or send it as you like.",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the receipt.");
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    if (!payload) return;
    const text = receiptText(payload, currency);
    setBusy("share");
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `Receipt ${payload.sale.receipt_number}`, text });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        toast.success("Receipt copied", { description: "Paste it into WhatsApp or SMS." });
        return;
      }
      toast.error("This browser cannot share or copy. Use Download instead.");
    } catch (error) {
      // A user cancelling the share sheet is not an error worth shouting about.
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error(error instanceof Error ? error.message : "Could not share the receipt.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto px-4 pb-8 pt-4">
        <SheetHeader className="px-0 pb-3 text-left">
          <SheetTitle className="text-base">Receipt</SheetTitle>
        </SheetHeader>

        {payloadQuery.isPending ? (
          <LoadingState label="Preparing the receipt…" />
        ) : payloadQuery.isError ? (
          <ErrorState
            message={payloadQuery.error.message}
            onRetry={() => void payloadQuery.refetch()}
          />
        ) : payload ? (
          <>
            <div className="rounded-xl border border-dashed border-border bg-secondary/40 p-4 font-mono text-xs leading-relaxed">
              <p className="text-center text-sm font-semibold uppercase tracking-wide">
                {payload.shop.name}
              </p>
              {payload.settings?.header_text ? (
                <p className="text-center text-muted-foreground">{payload.settings.header_text}</p>
              ) : null}
              {payload.shop.location ? (
                <p className="text-center text-muted-foreground">{payload.shop.location}</p>
              ) : null}
              {payload.shop.phone ? (
                <p className="text-center text-muted-foreground">{payload.shop.phone}</p>
              ) : null}

              <div className="my-3 border-t border-dashed border-border" />

              <div className="flex justify-between">
                <span>Receipt</span>
                <span>{payload.sale.receipt_number}</span>
              </div>
              <div className="flex justify-between">
                <span>Date</span>
                <span>{formatDateTime(payload.sale.sold_at)}</span>
              </div>
              {payload.sale.customer_name ? (
                <div className="flex justify-between">
                  <span>Customer</span>
                  <span>{payload.sale.customer_name}</span>
                </div>
              ) : null}

              <div className="my-3 border-t border-dashed border-border" />

              {payload.items.map((item) => (
                <div key={item.id} className="mb-1.5">
                  <p className="font-semibold">{item.product_name}</p>
                  <div className="flex justify-between text-muted-foreground">
                    <span>
                      {Number(item.quantity)} × {formatMoney(item.unit_price, currency)}
                    </span>
                    <span className="text-foreground">{formatMoney(item.subtotal, currency)}</span>
                  </div>
                </div>
              ))}

              <div className="my-3 border-t border-dashed border-border" />

              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatMoney(payload.sale.subtotal, currency)}</span>
              </div>
              {Number(payload.sale.discount_amount) > 0 ? (
                <div className="flex justify-between">
                  <span>Discount</span>
                  <span>-{formatMoney(payload.sale.discount_amount, currency)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-sm font-bold">
                <span>TOTAL</span>
                <span>{formatMoney(payload.sale.total_amount, currency)}</span>
              </div>

              <div className="my-3 border-t border-dashed border-border" />

              {payload.payments.map((payment) => (
                <div key={payment.id} className="flex justify-between">
                  <span className="uppercase">{payment.method}</span>
                  <span>{formatMoney(payment.amount, currency)}</span>
                </div>
              ))}
              {Number(payload.sale.balance_due) > 0 ? (
                <>
                  <div className="flex justify-between font-semibold">
                    <span>Balance owing</span>
                    <span>{formatMoney(payload.sale.balance_due, currency)}</span>
                  </div>
                  {payload.debtor ? (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Debtor</span>
                      <span>{payload.debtor.name}</span>
                    </div>
                  ) : null}
                </>
              ) : null}
              {Number(payload.sale.amount_paid) > Number(payload.sale.total_amount) ? (
                <div className="flex justify-between">
                  <span>Change</span>
                  <span>
                    {formatMoney(
                      Number(payload.sale.amount_paid) - Number(payload.sale.total_amount),
                      currency,
                    )}
                  </span>
                </div>
              ) : null}

              <div className="my-3 border-t border-dashed border-border" />
              <p className="text-center text-muted-foreground">
                {payload.settings?.footer_text || "Asante kwa biashara!"}
              </p>
              <p className="text-center text-muted-foreground">Powered by RAVQEN</p>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-12"
                onClick={handlePrint}
                disabled={busy !== null}
              >
                <Printer /> {busy === "print" ? "Opening…" : "Print"}
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={handleDownload}
                disabled={busy !== null}
              >
                <Download /> {busy === "download" ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="outline"
                className="h-12"
                onClick={() => void handleShare()}
                disabled={busy !== null}
              >
                <Share2 /> {busy === "share" ? "Sharing…" : "Share"}
              </Button>
            </div>

            {onNewSale ? (
              <Button
                className="mt-3 h-12 w-full"
                onClick={() => {
                  onOpenChange(false);
                  onNewSale();
                }}
              >
                New sale
              </Button>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
