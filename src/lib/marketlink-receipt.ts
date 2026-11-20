/**
 * SAVO Signature — marketplace documents.
 *
 * A pending order and a settled order must not look alike, so the document
 * label, the payment block and the wording are all driven by stored state. The
 * builder never computes a total the database did not send, and it never prints
 * "paid" unless a real sale row and its payments exist.
 */
import { formatDateTime, formatMoney } from "@/lib/format";
import type { OrderDocument } from "@/types/marketlink";

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

/** The one honest sentence about money for this document. */
export function paymentLine(doc: OrderDocument): string | null {
  if (doc.payment) {
    if (doc.payment.methods.length > 0) {
      return doc.payment.methods
        .map((entry) => `${entry.method} ${formatMoney(entry.amount, doc.currency)}`)
        .join(" · ");
    }
    if (Number(doc.payment.amount_paid) > 0) {
      return `Recorded payment ${formatMoney(doc.payment.amount_paid, doc.currency)}`;
    }
    return `Balance owing ${formatMoney(doc.payment.balance_due, doc.currency)}`;
  }
  return doc.status === "settled" || doc.status === "completed"
    ? "No payment record was created by SAVO for this order."
    : "No payment has been recorded. This is not a receipt for money paid.";
}

export function receiptDocumentText(doc: OrderDocument): string {
  const width = 42;
  const centre = (text: string) =>
    `${" ".repeat(Math.max(0, Math.floor((width - text.length) / 2)))}${text}`;
  const pad = (label: string, value: string) =>
    `${label}${" ".repeat(Math.max(1, width - label.length - value.length))}${value}`;
  const rule = (char = "-") => char.repeat(width);

  const lines: string[] = [centre(doc.shop.name.toUpperCase())];
  if (doc.shop.location) lines.push(centre(doc.shop.location));
  if (doc.shop.phone) lines.push(centre(doc.shop.phone));
  lines.push(rule("="));
  lines.push(centre(doc.document.toUpperCase()));
  lines.push(rule("="));
  lines.push(pad("Reference", doc.reference));
  lines.push(pad("Date", formatDateTime(doc.created_at)));
  lines.push(pad("Fulfilment", doc.fulfillment === "delivery" ? "Delivery" : "Collection"));
  lines.push(rule());

  for (const item of doc.items) {
    lines.push(item.name);
    lines.push(
      pad(
        `  ${Number(item.quantity)} x ${formatMoney(item.unit_price, doc.currency)}`,
        formatMoney(item.line_total, doc.currency),
      ),
    );
  }

  lines.push(rule());
  lines.push(pad("Subtotal", formatMoney(doc.subtotal, doc.currency)));
  if (doc.delivery_fee !== null) {
    lines.push(pad("Delivery", formatMoney(doc.delivery_fee, doc.currency)));
  }
  lines.push(pad("TOTAL", formatMoney(doc.total, doc.currency)));
  lines.push(rule());

  const payment = paymentLine(doc);
  if (payment) lines.push(...wrap(payment, width));
  if (doc.settled_at) lines.push(pad("Settled", formatDateTime(doc.settled_at)));

  lines.push(rule());
  lines.push(centre(doc.shop.footer_text || "Thank you for supporting this seller."));
  lines.push(centre("SAVO Signature"));
  return lines.join("\n");
}

function wrap(text: string, width: number): string[] {
  const words = text.split(" ");
  const rows: string[] = [];
  let row = "";
  for (const word of words) {
    if ((row + word).length > width) {
      if (row) rows.push(row.trimEnd());
      row = "";
    }
    row += `${word} `;
  }
  if (row.trim()) rows.push(row.trimEnd());
  return rows;
}

export function receiptDocumentHtml(doc: OrderDocument, logoUrl: string | null): string {
  const width = doc.shop.paper_width_mm ?? 58;
  const settled = doc.status === "settled" || doc.status === "completed";
  const payment = paymentLine(doc);
  const address = [
    doc.destination.address,
    doc.destination.city,
    doc.destination.region,
    doc.destination.country,
  ]
    .filter(Boolean)
    .join(", ");

  const itemRows = doc.items
    .map(
      (item) => `
      <tr class="item">
        <td colspan="2">${esc(item.name)}</td>
      </tr>
      <tr class="muted">
        <td>${Number(item.quantity)} × ${esc(formatMoney(item.unit_price, doc.currency))}</td>
        <td class="right">${esc(formatMoney(item.line_total, doc.currency))}</td>
      </tr>`,
    )
    .join("");

  const historyRows = doc.history
    .map(
      (entry) =>
        `<tr class="muted"><td>${esc(formatDateTime(entry.at))}</td><td class="right">${esc(
          (entry.to ?? "").replace(/_/g, " "),
        )}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(doc.document)} ${esc(doc.reference)} — ${esc(doc.shop.name)}</title>
<style>
  @page { margin: 4mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto; width: ${width}mm; max-width: 100%; padding: 10px 9px;
    font-family: "Helvetica Neue", Arial, sans-serif;
    font-size: 10.5px; line-height: 1.45; color: #14201c; background: #fff;
  }
  .band { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #0f6b52; padding-bottom: 5px; }
  .brand { font-size: 13px; font-weight: 700; letter-spacing: .02em; }
  .doc { font-size: 9px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; color: #0f6b52; }
  .meta { margin-top: 6px; font-size: 9.5px; color: #4b5a54; }
  .state { display: inline-block; margin-top: 5px; padding: 2px 7px; border-radius: 999px; background: ${settled ? "#e7f5ee" : "#f3f1e7"}; color: ${settled ? "#0f6b52" : "#7a5a12"}; font-size: 8.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  .right { text-align: right; }
  .muted { color: #55635d; }
  .item td { padding-top: 5px; font-weight: 600; }
  hr { border: 0; border-top: 1px solid #d9e2dd; margin: 7px 0; }
  .total { font-size: 12px; font-weight: 700; border-top: 1.5px solid #14201c; padding-top: 4px; }
  .note { margin-top: 7px; padding: 6px 7px; background: #f6f7f5; border-left: 2px solid #0f6b52; font-size: 9px; color: #4b5a54; }
  footer { margin-top: 8px; text-align: center; font-size: 9px; color: #55635d; }
  .logo { display: block; max-height: 40px; max-width: 60%; object-fit: contain; margin-bottom: 4px; }
</style>
</head>
<body>
  <div class="band">
    <div>
      ${doc.shop.show_logo && logoUrl ? `<img class="logo" src="${esc(logoUrl)}" alt="" />` : ""}
      <div class="brand">${esc(doc.shop.name)}</div>
    </div>
    <div class="doc">${esc(doc.document)}</div>
  </div>
  <div class="meta">
    ${doc.shop.header_text ? `<div>${esc(doc.shop.header_text)}</div>` : ""}
    ${doc.shop.location ? `<div>${esc(doc.shop.location)}</div>` : ""}
    ${doc.shop.phone ? `<div>${esc(doc.shop.phone)}</div>` : ""}
    <div>${esc(doc.reference)} · ${esc(formatDateTime(doc.created_at))}</div>
    <div>${esc(doc.fulfillment === "delivery" ? "Delivery" : "Collection")}${
      address ? ` · ${esc(address)}` : ""
    }</div>
  </div>
  <div class="state">${esc(settled ? "Settled by both parties" : doc.status.replace(/_/g, " "))}</div>
  <hr />
  <table>${itemRows}</table>
  <hr />
  <table>
    <tr><td>Subtotal</td><td class="right">${esc(formatMoney(doc.subtotal, doc.currency))}</td></tr>
    ${
      doc.delivery_fee !== null
        ? `<tr><td>Delivery</td><td class="right">${esc(formatMoney(doc.delivery_fee, doc.currency))}</td></tr>`
        : ""
    }
    <tr class="total"><td>TOTAL</td><td class="right">${esc(formatMoney(doc.total, doc.currency))}</td></tr>
  </table>
  ${payment ? `<div class="note">${esc(payment)}</div>` : ""}
  ${
    doc.settled_at
      ? `<div class="note">Completion confirmed by customer ${esc(
          doc.customer_confirmed_at ? formatDateTime(doc.customer_confirmed_at) : "—",
        )} and seller ${esc(doc.seller_confirmed_at ? formatDateTime(doc.seller_confirmed_at) : "—")}.</div>`
      : ""
  }
  ${doc.dispute_reason ? `<div class="note">Dispute: ${esc(doc.dispute_reason)}</div>` : ""}
  ${historyRows ? `<hr /><table>${historyRows}</table>` : ""}
  <footer>
    <p>${esc(doc.shop.footer_text || "Thank you for supporting this seller.")}</p>
    <p class="muted">SAVO Signature · this document is not proof of online payment</p>
  </footer>
</body>
</html>`;
}
