/**
 * Receipt rendering.
 *
 * Pure functions over rows that were read back from the database, so a receipt
 * can only ever print what was actually stored — there is no client-side
 * recomputation of totals that could disagree with the ledger.
 */
import { BARE_SCALE, GLYPH, markTransform, VIEW_BOX } from "@/components/brand/mark-geometry";
import { formatDateTime, formatMoney } from "@/lib/format";
import type { ReceiptPayload } from "@/services/sales.service";

/**
 * RAVQEN's symbol, for the receipt header.
 *
 * One ink, no tile, no gradient, and small. A thermal printer has no greys to
 * fade and no room to waste, so the mark is reduced to the only form that
 * survives that: the same three filled paths in black on white, scaled by the
 * same number the app uses, and inlined rather than linked so the receipt is a
 * single self-contained file a shopkeeper can share or print from a phone with
 * no network.
 */
function receiptMark(size = 26) {
  const paths = [GLYPH.bowl, GLYPH.stem, GLYPH.leg].map((d) => `<path d="${d}"/>`).join("");
  return (
    `<svg class="mark" width="${size}" height="${size}" viewBox="0 0 ${VIEW_BOX} ${VIEW_BOX}" ` +
    `fill="#000" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<g transform="${markTransform(BARE_SCALE)}">${paths}</g>` +
    `</svg>`
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

/** Plain text, used for Share and for the downloaded .txt fallback. */
export function receiptText(payload: ReceiptPayload, currency = "KES") {
  const { shop, sale, items, payments, debtor, settings } = payload;
  const lines: string[] = [];

  lines.push(centre(shop.name.toUpperCase()));
  if (settings?.header_text) lines.push(centre(settings.header_text));
  if (shop.location) lines.push(centre(shop.location));
  if (shop.phone) lines.push(centre(shop.phone));
  lines.push(rule());
  lines.push(line("Receipt", sale.receipt_number));
  lines.push(line("Date", formatDateTime(sale.sold_at)));
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
  if (Number(sale.balance_due) > 0) {
    lines.push(line("Balance owing", formatMoney(sale.balance_due, currency)));
    if (debtor) lines.push(line("Debtor", debtor.name));
  }
  if (Number(sale.amount_paid) > Number(sale.total_amount)) {
    lines.push(
      line("Change", formatMoney(Number(sale.amount_paid) - Number(sale.total_amount), currency)),
    );
  }

  lines.push(rule());
  lines.push(centre(settings?.footer_text || "Asante kwa biashara!"));
  lines.push(centre("Powered by RAVQEN"));

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
  const { shop, sale, items, payments, debtor, settings } = payload;
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

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Receipt ${esc(sale.receipt_number)} — ${esc(shop.name)}</title>
<style>
  @page { margin: 4mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; padding: 8px;
    width: ${width}mm; max-width: 100%;
    font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    font-size: 11px; line-height: 1.45; color: #000; background: #fff;
  }
  h1 { font-size: 14px; margin: 0 0 2px; text-align: center; letter-spacing: .04em; }
  .muted { color: #444; }
  .centre { text-align: center; }
  .right { text-align: right; }
  hr { border: 0; border-top: 1px dashed #999; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.name { font-weight: 600; padding-top: 4px; }
  .total { font-size: 13px; font-weight: 700; }
  .logo { display: block; margin: 0 auto 6px; max-height: 48px; max-width: 70%; object-fit: contain; }
  .mark { display: block; margin: 0 auto 4px; }
  footer { margin-top: 8px; text-align: center; }
</style>
</head>
<body>
  ${receiptMark()}
  ${showLogo ? `<img class="logo" src="${esc(options.logoUrl)}" alt="${esc(shop.name)} logo" />` : ""}
  <h1>${esc(shop.name)}</h1>
  ${settings?.header_text ? `<p class="centre muted">${esc(settings.header_text)}</p>` : ""}
  ${shop.location ? `<p class="centre muted">${esc(shop.location)}</p>` : ""}
  ${shop.phone ? `<p class="centre muted">${esc(shop.phone)}</p>` : ""}
  <hr />
  <table>
    <tr><td>Receipt</td><td class="right" colspan="2">${esc(sale.receipt_number)}</td></tr>
    <tr><td>Date</td><td class="right" colspan="2">${esc(formatDateTime(sale.sold_at))}</td></tr>
    ${sale.customer_name ? `<tr><td>Customer</td><td class="right" colspan="2">${esc(sale.customer_name)}</td></tr>` : ""}
  </table>
  <hr />
  <table>${itemRows}</table>
  <hr />
  <table>
    <tr><td>Subtotal</td><td class="right" colspan="2">${esc(formatMoney(sale.subtotal, currency))}</td></tr>
    ${
      Number(sale.discount_amount) > 0
        ? `<tr><td>Discount</td><td class="right" colspan="2">-${esc(formatMoney(sale.discount_amount, currency))}</td></tr>`
        : ""
    }
    <tr class="total"><td>TOTAL</td><td class="right" colspan="2">${esc(formatMoney(sale.total_amount, currency))}</td></tr>
  </table>
  <hr />
  <table>
    ${paymentRows}
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
  <hr />
  <footer>
    <p>${esc(settings?.footer_text || "Asante kwa biashara!")}</p>
    <p class="muted">Powered by RAVQEN</p>
  </footer>
</body>
</html>`;
}
