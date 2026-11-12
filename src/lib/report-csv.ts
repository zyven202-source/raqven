/**
 * The Reports page, as a file.
 *
 * The screen is three things: a set of figures for the period, a ranking of what
 * sold, and the transactions behind both. The export is all three, in that
 * order, as one file — because the reason to export a report is to hand it to
 * someone or put it in a book, and a book wants the whole thing rather than
 * three attachments.
 *
 * The layout is a bank statement's: a header, then labelled blocks separated
 * by a blank line, each with its own column headings. That is ragged by design
 * and every spreadsheet reads it correctly. The alternative — forcing the
 * summary into the transactions' eleven columns to make the file perfectly
 * rectangular — produces a file that is tidier to parse and much harder to read,
 * which is the wrong trade for a file a human opens first.
 *
 * Everything here is derived from data the page has already been given, or from
 * the same ledger read model the other screens use. Nothing is recomputed: the
 * figures come from `shop_report`, which computes them in PostgreSQL and
 * re-checks ownership there, so an export cannot disagree with the screen or
 * with the database.
 */
import type { ShopReport } from "@/services/reports.service";
import {
  kindLabel,
  type TransactionDirection,
  type TransactionRow,
} from "@/services/transactions.service";

import {
  CSV_BLANK,
  buildCsv,
  csvCount,
  csvDate,
  csvNumber,
  csvRow,
  csvStamp,
  csvText,
  csvTime,
} from "./csv";

export interface ReportCsvInput {
  shopName: string;
  currency: string;
  /** "Today", "This month" — the tab the owner was looking at. */
  periodLabel: string;
  from: Date;
  to: Date;
  report: ShopReport;
  rows: TransactionRow[];
  exportedAt: Date;
  /**
   * True when the period held more rows than the export was willing to fetch.
   * The file says so at the top rather than quietly shipping a partial ledger.
   */
  truncated: boolean;
}

/** Columns of the transaction block, in order. */
const TRANSACTION_HEADERS = [
  "Date",
  "Time",
  "Type",
  "Description",
  "Reference",
  "Money in",
  "Money out",
  "Quantity",
  "Sold by",
  "Status",
] as const;

export function buildReportCsv(input: ReportCsvInput): string {
  const { report, rows, currency } = input;
  const lines: string[] = [];

  // --- who and when. Without this, a file called "report.csv" emailed three
  // weeks later is a rumour rather than a record.
  lines.push(csvRow([csvText("Pith report")]));
  lines.push(csvRow([csvText("Shop"), csvText(input.shopName)]));
  lines.push(
    csvRow([
      csvText("Period"),
      csvText(`${input.periodLabel} (${csvStamp(input.from)} to ${csvStamp(input.to)})`),
    ]),
  );
  lines.push(csvRow([csvText("Currency"), csvText(currency)]));
  lines.push(csvRow([csvText("Exported"), csvText(csvStamp(input.exportedAt))]));

  if (input.truncated) {
    // Near the top on purpose: a partial ledger is still useful, but only if the
    // reader is told which half of it they are holding.
    lines.push(
      csvRow([
        csvText("Note"),
        csvText(
          `Only the most recent ${rows.length} transactions are included. ` +
            "Narrow the date range on the Reports page to export the rest.",
        ),
      ]),
    );
  }

  // --- the figures, in the order the screen shows them.
  lines.push(CSV_BLANK);
  lines.push(csvRow([csvText("SUMMARY")]));
  lines.push(csvRow([csvText("Measure"), csvText("Amount")]));
  lines.push(csvRow([csvText("Sales count"), csvCount(report.salesCount)]));
  lines.push(csvRow([csvText("Takings"), csvNumber(report.grossSales)]));
  if (report.discounts > 0) {
    lines.push(csvRow([csvText("Discounts given"), csvNumber(report.discounts)]));
  }
  lines.push(csvRow([csvText("Cost of the goods sold"), csvNumber(report.costOfGoods)]));
  lines.push(
    csvRow([csvText("Gross profit (estimate)"), csvNumber(report.grossSales - report.costOfGoods)]),
  );
  lines.push(csvRow([csvText("Expenses"), csvNumber(report.expenses)]));
  lines.push(
    csvRow([
      csvText("Net result (estimate)"),
      csvNumber(report.grossSales - report.costOfGoods - report.expenses),
    ]),
  );
  if (report.refunds > 0) {
    lines.push(csvRow([csvText("Refunds paid back"), csvNumber(report.refunds)]));
  }
  lines.push(CSV_BLANK);
  lines.push(csvRow([csvText("Taken at the till"), csvNumber(report.collected)]));
  lines.push(csvRow([csvText("Collected from debtors"), csvNumber(report.debtCollected)]));
  lines.push(CSV_BLANK);
  lines.push(
    csvRow([csvText("Owed to you across all debtors"), csvNumber(report.outstandingCredit)]),
  );
  lines.push(csvRow([csvText("Stock at cost"), csvNumber(report.stockValue)]));
  lines.push(csvRow([csvText("Products below reorder level"), csvCount(report.lowStockCount)]));

  // --- what sold.
  lines.push(CSV_BLANK);
  lines.push(csvRow([csvText("TOP PRODUCTS")]));
  if (report.topProducts.length === 0) {
    lines.push(csvRow([csvText("No products were sold in this period.")]));
  } else {
    lines.push(
      csvRow([csvText("Rank"), csvText("Product"), csvText("Quantity sold"), csvText("Takings")]),
    );
    report.topProducts.forEach((product, index) => {
      lines.push(
        csvRow([
          csvCount(index + 1),
          csvText(product.name),
          csvCount(product.quantity),
          csvNumber(product.revenue),
        ]),
      );
    });
  }

  // --- and the transactions behind all of it.
  lines.push(CSV_BLANK);
  lines.push(csvRow([csvText("TRANSACTIONS")]));
  if (rows.length === 0) {
    lines.push(csvRow([csvText("No transactions were recorded in this period.")]));
  } else {
    lines.push(csvRow([...TRANSACTION_HEADERS]));
    for (const row of rows) {
      lines.push(csvRow(transactionCells(row)));
    }
  }

  return buildCsv(lines);
}

/**
 * One transaction as cells.
 *
 * The sign lives in the column, not in the number: a spreadsheet can total a
 * "Money in" column, and a column of signed values where half of them are
 * negative is a trap for whoever opens it next. Stock movements are neutral, so
 * they carry a quantity and leave both money columns empty rather than
 * pretending to be money in or out.
 *
 * The date and time are formatted, not sliced. `occurredAt` arrives as a UTC
 * ISO string, and Nairobi is three hours ahead of it — slicing would file every
 * evening sale under the following morning, which is the kind of error nobody
 * notices until the till and the bank disagree.
 */
function transactionCells(row: TransactionRow): string[] {
  const direction: TransactionDirection = row.direction;
  const moneyIn = direction === "in" ? csvNumber(row.amount) : "";
  const moneyOut = direction === "out" ? csvNumber(row.amount) : "";
  const quantity = row.quantity === null ? "" : csvCount(row.quantity);

  return [
    csvDate(row.occurredAt),
    csvTime(row.occurredAt),
    csvText(kindLabel(row.kind)),
    csvText([row.title, row.subtitle].filter(Boolean).join(" — ")),
    csvText(row.reference),
    moneyIn,
    moneyOut,
    quantity,
    csvText(row.userName),
    csvText(row.status),
  ];
}
