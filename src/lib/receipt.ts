/**
 * Receipt rendering.
 *
 * Pure functions over rows that were read back from the database, so a receipt
 * can only ever print what was actually stored — there is no client-side
 * recomputation of totals that could disagree with the ledger.
 */
import { MARK, VIEW_BOX } from "@/components/brand/mark-geometry";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { ReceiptPayload } from "@/services/sales.service";

/**
 * SAVO's mark, for the receipt header.
 *
 * The mark is a stroked path, not a font glyph, so the receipt carries the
 * exact same symbol the app icon draws — in black, the one ink a thermal head
 * cannot lose. No image and no webfont: a receipt has to print from a phone
 * with no network, so the mark is inline SVG, not a file.
 */
function receiptMark(size = 22) {
  return (
    `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 ${VIEW_BOX} ${VIEW_BOX}" ` +
    `fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">` +
    `<path d="${MARK.path}" stroke="#000" stroke-width="${MARK.stroke}" ` +
    `stroke-linecap="${MARK.linecap}"/></svg>`
  );
}

function line(label: string, value: string, width = 42) {
  const gap = Math.max(1, width - label.length - value.length);
  return `${label}${" ".repeat(gap)}${value}`;
}

function centre(text: string, width = 42) {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return `${" ".repeat(pad)}${text}`;
}

function rule(width = 42, char = "-") {
  return char.repeat(width);
}

/** Refunds recorded against this sale, oldest first, minus rejected ones. */
function acceptedRefunds(payload: ReceiptPayload) {
  return payload.refunds.filter((refund) => refund.status !== "rejected");
}

/** Plain text, used for Share, WhatsApp and the download fallback. */
export function receiptText(payload: ReceiptPayload, currency = "KES") {
  const { shop, sale, items, payments, refunds, debtor, settings, cashierName } = payload;
  const lines: string[] = [];

  lines.push(centre(shop.name.toUpperCase()));
  if (settings?.header_text) lines.push(centre(settings.header_text));
  if (shop.location) lines.push(centre(shop.location));
  if (shop.phone) lines.push(centre(shop.phone));
  lines.push(centre("Powered by SAVO"));
  lines.push(rule());
  lines.push(line("Receipt", sale.receipt_number));
  lines.push(line("Date", formatDateTime(sale.sold_at)));
  if (cashierName) lines.push(line("Served by", cashierName));
  if (sale.customer_name) lines.push(line("Customer", sale.customer_name));
  lines.push(rule());

  for (const item of items) {
    lines.push(item.product_name);
    lines.push(
      line(
        `  ${Number(item.quantity)} x ${formatMoney(item.unit_price, currency)}`,
        formatMoney(item.subtotal, currency),
      ),
    );
  }

  lines.push(rule());
  lines.push(line("Subtotal", formatMoney(sale.subtotal, currency)));
  if (Number(sale.discount_amount) > 0) {
    lines.push(line("Discount", `-${formatMoney(sale.discount_amount, currency)}`));
  }
  lines.push(line("TOTAL", formatMoney(sale.total_amount, currency), 42));
  lines.push(rule());

  for (const payment of payments) {
    lines.push(line(payment.method.toUpperCase(), formatMoney(payment.amount, currency)));
  }
  if (Number(sale.amount_paid) > 0) {
    lines.push(line("Paid", formatMoney(sale.amount_paid, currency)));
  }
  if (Number(sale.balance_due) > 0) {
    lines.push(line("Balance owing", formatMoney(sale.balance_due, currency)));
    if (debtor) lines.push(line("Debtor", debtor.name));
  }
  if (Number(sale.amount_paid) > Number(sale.total_amount)) {
    lines.push(
      line("Change", formatMoney(Number(sale.amount_paid) - Number(sale.total_amount), currency)),
    );
  }

  const accepted = acceptedRefunds(payload);
  if (accepted.length > 0) {
    lines.push(rule());
    lines.push(centre("REFUNDS"));
    for (const refund of accepted) {
      lines.push(
        line(
          `  ${formatDateTime(refund.created_at).split(",")[0]}`,
          formatMoney(refund.total_amount, currency),
        ),
      );
    }
    const refunded = accepted.reduce((sum, refund) => sum + Number(refund.total_amount), 0);
    lines.push(line("Refunded", formatMoney(refunded, currency)));
  }

  lines.push(rule());
  lines.push(centre(settings?.footer_text || "Thank you for your business!"));
  lines.push(centre("Powered by SAVO"));

  return lines.join("\n");
}

/**
 * A standalone HTML document sized for a thermal receipt.
 * Built here rather than reusing app markup so printing never has to fight the
 * application's layout, and so the same HTML can be downloaded or opened in a
 * new tab on a device whose print dialog is awkward.
 */
export function receiptHtml(
  payload: ReceiptPayload,
  options: { currency?: string; logoUrl?: string | null } = {},
) {
  const currency = options.currency ?? "KES";
  const { shop, sale, items, payments, refunds, debtor, settings, cashierName } = payload;
  const width = settings?.paper_width_mm ?? 58;
  const showLogo = settings?.show_logo !== false && Boolean(options.logoUrl);

  const esc = (value: unknown) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return "&#39;";
      }
    });

  const itemRows = items
    .map(
      (item) => `
      <tr>
        <td colspan="3" class="name">${esc(item.product_name)}</td>
      </tr>
      <tr>
        <td>${Number(item.quantity)} × ${esc(formatMoney(item.unit_price, currency))}</td>
        <td class="right" colspan="2">${esc(formatMoney(item.subtotal, currency))}</td>
      </tr>`,
    )
    .join("");

  const paymentRows = payments
    .map(
      (payment) =>
        `<tr><td>${esc(payment.method.toUpperCase())}</td><td class="right" colspan="2">${esc(
          formatMoney(payment.amount, currency),
        )}</td></tr>`,
    )
    .join("");

  const change = Number(sale.amount_paid) - Number(sale.total_amount);

  const accepted = acceptedRefunds(payload);
  const refunded = accepted.reduce((sum, refund) => sum + Number(refund.total_amount), 0);
  const refundRows = accepted
    .map(
      (refund) =>
        `<tr><td>Refund ${esc(formatDateTime(refund.created_at))}</td>` +
        `<td class="right" colspan="2">${esc(formatMoney(refund.total_amount, currency))}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Receipt ${esc(sale.receipt_number)} — ${esc(shop.name)}</title>
<style>
  /* SAVO Signature: one ink for the thermal head, emerald only as a rule. */
  @page { margin: 4mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; padding: 9px 8px;
    width: ${width}mm; max-width: 100%;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 10.5px; line-height: 1.5; color: #14201c; background: #fff;
    font-variant-numeric: tabular-nums;
  }
  .band { border-top: 3px solid #0f6b52; padding-top: 6px; }
  .kicker { font-size: 8px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; color: #0f6b52; text-align: center; }
  h1 { font-size: 13px; margin: 3px 0 1px; text-align: center; letter-spacing: .05em; text-transform: uppercase; }
  .muted { color: #55635d; }
  .centre { text-align: center; }
  .right { text-align: right; }
  hr { border: 0; border-top: 1px solid #ccd8d2; margin: 7px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.name { font-weight: 700; padding-top: 5px; }
  .label { color: #55635d; }
  .total { font-size: 13px; font-weight: 700; border-top: 1.5px solid #14201c; }
  .total td { padding-top: 4px; }
  .state { margin: 4px 0 0; text-align: center; font-size: 8.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #0f6b52; }
  .logo { display: block; margin: 0 auto 6px; max-height: 48px; max-width: 70%; object-fit: contain; }
  .mark { display: block; margin: 0 auto 5px; }
  footer { margin-top: 9px; text-align: center; font-size: 9.5px; }
  footer .sig { margin-top: 3px; color: #55635d; font-size: 8.5px; letter-spacing: .08em; }
</style>
</head>
<body>
  <div class="band">
    ${receiptMark()}
    ${showLogo ? `<img class="logo" src="${esc(options.logoUrl)}" alt="${esc(shop.name)} logo" />` : ""}
    <p class="kicker">Sales receipt</p>
    <h1>${esc(shop.name)}</h1>
    ${settings?.header_text ? `<p class="centre muted">${esc(settings.header_text)}</p>` : ""}
    ${shop.location ? `<p class="centre muted">${esc(shop.location)}</p>` : ""}
    ${shop.phone ? `<p class="centre muted">${esc(shop.phone)}</p>` : ""}
    <p class="state">${payments.length > 0 || Number(sale.amount_paid) > 0 ? "Payment recorded" : Number(sale.balance_due) > 0 ? "Balance outstanding" : "Completed sale"}</p>
  </div>
  <hr />
  <table>
    <tr><td class="label">Receipt</td><td class="right" colspan="2">${esc(sale.receipt_number)}</td></tr>
    <tr><td class="label">Date</td><td class="right" colspan="2">${esc(formatDateTime(sale.sold_at))}</td></tr>
    ${cashierName ? `<tr><td class="label">Served by</td><td class="right" colspan="2">${esc(cashierName)}</td></tr>` : ""}
    ${sale.customer_name ? `<tr><td class="label">Customer</td><td class="right" colspan="2">${esc(sale.customer_name)}</td></tr>` : ""}
  </table>
  <hr />
  <table>${itemRows}</table>
  <hr />
  <table>
    <tr><td class="label">Subtotal</td><td class="right" colspan="2">${esc(formatMoney(sale.subtotal, currency))}</td></tr>
    ${
      Number(sale.discount_amount) > 0
        ? `<tr><td class="label">Discount</td><td class="right" colspan="2">-${esc(formatMoney(sale.discount_amount, currency))}</td></tr>`
        : ""
    }
    <tr class="total"><td>TOTAL</td><td class="right" colspan="2">${esc(formatMoney(sale.total_amount, currency))}</td></tr>
  </table>
  <hr />
  <table>
    ${paymentRows}
    ${
      Number(sale.amount_paid) > 0
        ? `<tr><td>Paid</td><td class="right" colspan="2">${esc(formatMoney(sale.amount_paid, currency))}</td></tr>`
        : ""
    }
    ${
      Number(sale.balance_due) > 0
        ? `<tr><td>Balance owing</td><td class="right" colspan="2">${esc(formatMoney(sale.balance_due, currency))}</td></tr>${
            debtor
              ? `<tr><td>Debtor</td><td class="right" colspan="2">${esc(debtor.name)}</td></tr>`
              : ""
          }`
        : ""
    }
    ${change > 0 ? `<tr><td>Change</td><td class="right" colspan="2">${esc(formatMoney(change, currency))}</td></tr>` : ""}
  </table>
  ${
    accepted.length > 0
      ? `<hr />
  <table>
    <tr><td class="name" colspan="3">REFUNDS</td></tr>
    ${refundRows}
    <tr><td>Refunded</td><td class="right" colspan="2">${esc(formatMoney(refunded, currency))}</td></tr>
  </table>`
      : ""
  }
  <hr />
  <footer>
    <hr />
    <p>${esc(settings?.footer_text || "Thank you for your business!")}</p>
    <p class="sig">SAVO Signature</p>
  </footer>
</body>
</html>`;
}
