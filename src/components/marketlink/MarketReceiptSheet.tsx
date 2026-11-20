import { useState } from "react";
import { Download, Loader2, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useOrderDocument } from "@/hooks/useMarketCommerce";
import { useStorageUrl } from "@/hooks/useStorageUrl";
import { formatDateTime, formatMoney } from "@/lib/format";
import { paymentLine, receiptDocumentHtml, receiptDocumentText } from "@/lib/marketlink-receipt";
import { MARKETLINK_STATUS_LABEL, isSettled, type MarketOrderState } from "@/types/marketlink";
import { cn } from "@/lib/utils";

/**
 * SAVO Signature for a marketplace order.
 *
 * The same stored payload feeds the preview, the printed slip, the download and
 * the shared text, so those four can never disagree about a price.
 */
export function MarketReceiptSheet({
  orderId,
  open,
  onOpenChange,
}: {
  orderId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const document = useOrderDocument(open ? orderId : null);
  const [busy, setBusy] = useState<"print" | "download" | "share" | null>(null);
  const logoUrl = useStorageUrl("shop-logos", document.data?.shop.logo_url ?? null);
  const doc = document.data;
  const settled = doc ? isSettled(doc.status) : false;

  function handlePrint() {
    if (!doc) return;
    setBusy("print");
    try {
      const frame = window.document.createElement("iframe");
      frame.setAttribute("aria-hidden", "true");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      frame.srcdoc = receiptDocumentHtml(doc, logoUrl);
      frame.onload = () => {
        const win = frame.contentWindow;
        if (!win) {
          toast.error("This browser would not open a print view. Use Save instead.");
          frame.remove();
          setBusy(null);
          return;
        }
        win.focus();
        win.print();
        setTimeout(() => {
          frame.remove();
          setBusy(null);
        }, 1000);
      };
      window.document.body.appendChild(frame);
    } catch (error) {
      setBusy(null);
      toast.error(error instanceof Error ? error.message : "Could not open the print view.");
    }
  }

  function handleDownload() {
    if (!doc) return;
    setBusy("download");
    try {
      const blob = new Blob([receiptDocumentHtml(doc, logoUrl)], {
        type: "text/html;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = `${doc.reference}-${doc.status}.html`;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("Document saved", { description: "Open it to print or send it as you like." });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the document.");
    } finally {
      setBusy(null);
    }
  }

  async function handleShare() {
    if (!doc) return;
    setBusy("share");
    const text = receiptDocumentText(doc);
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `${doc.document} ${doc.reference}`, text });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        toast.success("Document copied", { description: "Paste it into WhatsApp or SMS." });
        return;
      }
      toast.error("This browser cannot share or copy. Use Save instead.");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error(error instanceof Error ? error.message : "Could not share the document.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto px-4 pb-8 pt-4">
        <SheetHeader className="px-0 pb-3 text-left">
          <SheetTitle className="text-base">SAVO Signature</SheetTitle>
        </SheetHeader>

        {document.isPending ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" aria-hidden />
          </div>
        ) : document.isError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {document.error instanceof Error
              ? document.error.message
              : "This document could not load."}
          </p>
        ) : doc ? (
          <>
            <article className="mx-auto w-full max-w-sm overflow-hidden rounded-lg border border-[var(--brand-line)] bg-white text-[#14201c] shadow-[0_16px_40px_-24px_rgb(0_0_0/0.45)]">
              <header className="flex items-baseline justify-between border-b-2 border-[#0f6b52] px-4 pb-2 pt-4">
                <div className="min-w-0">
                  {doc.shop.show_logo && logoUrl ? (
                    <img src={logoUrl} alt="" className="mb-1 max-h-8 object-contain" />
                  ) : null}
                  <p className="truncate text-[13px] font-bold tracking-tight">{doc.shop.name}</p>
                </div>
                <p className="shrink-0 text-[9px] font-bold uppercase tracking-[0.16em] text-[#0f6b52]">
                  {doc.document}
                </p>
              </header>

              <div className="px-4 py-3">
                <div className="text-[10px] leading-relaxed text-[#4b5a54]">
                  {doc.shop.header_text ? <p>{doc.shop.header_text}</p> : null}
                  {doc.shop.location ? <p>{doc.shop.location}</p> : null}
                  {doc.shop.phone ? <p>{doc.shop.phone}</p> : null}
                  <p className="tnum mt-1 text-[#14201c]">
                    {doc.reference} · {formatDateTime(doc.created_at)}
                  </p>
                </div>

                <span
                  className={cn(
                    "mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]",
                    settled ? "bg-[#e7f5ee] text-[#0f6b52]" : "bg-[#f3f1e7] text-[#7a5a12]",
                  )}
                >
                  {settled
                    ? "Settled by both parties"
                    : MARKETLINK_STATUS_LABEL[doc.status as MarketOrderState]}
                </span>

                <ul className="mt-3 divide-y divide-[#eef2ef] border-y border-[#eef2ef]">
                  {doc.items.map((item, index) => (
                    <li key={`${item.name}-${index}`} className="py-2">
                      <p className="text-[11px] font-semibold leading-snug">{item.name}</p>
                      <div className="tnum flex justify-between text-[10px] text-[#55635d]">
                        <span>
                          {Number(item.quantity)} × {formatMoney(item.unit_price, doc.currency)}
                        </span>
                        <span className="text-[#14201c]">
                          {formatMoney(item.line_total, doc.currency)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>

                <dl className="mt-2 space-y-0.5 text-[10.5px]">
                  <div className="flex justify-between">
                    <dt className="text-[#55635d]">Subtotal</dt>
                    <dd className="tnum">{formatMoney(doc.subtotal, doc.currency)}</dd>
                  </div>
                  {doc.delivery_fee !== null ? (
                    <div className="flex justify-between">
                      <dt className="text-[#55635d]">Delivery</dt>
                      <dd className="tnum">{formatMoney(doc.delivery_fee, doc.currency)}</dd>
                    </div>
                  ) : null}
                  <div className="mt-1 flex justify-between border-t-[1.5px] border-[#14201c] pt-1 text-[12px] font-bold">
                    <dt>Total</dt>
                    <dd className="tnum">{formatMoney(doc.total, doc.currency)}</dd>
                  </div>
                </dl>

                <p className="mt-2 border-l-2 border-[#0f6b52] bg-[#f6f7f5] px-2 py-1.5 text-[9.5px] leading-relaxed text-[#4b5a54]">
                  {paymentLine(doc)}
                </p>

                {doc.dispute_reason ? (
                  <p className="mt-2 text-[9.5px] leading-relaxed text-[#8a3b1e]">
                    Dispute: {doc.dispute_reason}
                  </p>
                ) : null}

                <footer className="mt-3 border-t border-[#eef2ef] pt-2 text-center text-[9px] text-[#55635d]">
                  <p>{doc.shop.footer_text || "Thank you for supporting this seller."}</p>
                  <p className="mt-0.5">SAVO Signature · not proof of online payment</p>
                </footer>
              </div>
            </article>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-11"
                onClick={handlePrint}
                disabled={busy !== null}
              >
                <Printer /> {busy === "print" ? "Opening…" : "Print"}
              </Button>
              <Button
                variant="outline"
                className="h-11"
                onClick={handleDownload}
                disabled={busy !== null}
              >
                <Download /> {busy === "download" ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="outline"
                className="h-11"
                onClick={() => void handleShare()}
                disabled={busy !== null}
              >
                <Share2 /> {busy === "share" ? "Sharing…" : "Share"}
              </Button>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              This document reflects the order as stored. A settled confirmation means both sides
              acknowledged completion; it is not a card or online payment.
            </p>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
