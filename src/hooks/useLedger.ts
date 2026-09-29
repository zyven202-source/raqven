import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { downloadCsv, csvDate } from "@/lib/csv";
import { slugify } from "@/lib/format";
import { buildReportCsv } from "@/lib/report-csv";
import { getShopReport, type ShopReport } from "@/services/reports.service";
import {
  createRefund,
  listRefunds,
  refundedQuantities,
  type CreateRefundInput,
} from "@/services/refunds.service";
import { listTransactions, type ListTransactionsOptions } from "@/services/transactions.service";

// ------------------------------------------------------------------ ledger

export function useTransactions(options: ListTransactionsOptions) {
  return useQuery({
    queryKey: ["transactions", options.shopId, { from: options.from ?? "", to: options.to ?? "" }],
    queryFn: () => listTransactions(options),
    enabled: Boolean(options.shopId),
    placeholderData: (previous) => previous,
  });
}

// ----------------------------------------------------------------- refunds

export function useRefunds(shopId: string) {
  return useQuery({
    queryKey: ["refunds", shopId],
    queryFn: () => listRefunds(shopId),
    enabled: Boolean(shopId),
  });
}

export function useRefundedQuantities(saleId: string | null) {
  return useQuery({
    queryKey: ["refunded", saleId ?? "none"],
    queryFn: () => refundedQuantities(saleId as string),
    enabled: Boolean(saleId),
  });
}

export function useCreateRefund(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRefundInput) => createRefund(input),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["refunds", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["refunded", variables.saleId] });
      void queryClient.invalidateQueries({ queryKey: ["sale", variables.saleId] });
      void queryClient.invalidateQueries({ queryKey: ["receipt", variables.saleId] });
      void queryClient.invalidateQueries({ queryKey: ["products", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["sellable", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["movements", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["transactions", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["debtors", shopId] });
      void queryClient.invalidateQueries({ queryKey: ["report", shopId] });
    },
  });
}

// ----------------------------------------------------------------- reports

export function useShopReport(shopId: string, from: Date, to: Date, enabled: boolean) {
  return useQuery({
    queryKey: ["report", shopId, from.toISOString(), to.toISOString()],
    queryFn: () => getShopReport(shopId, from, to),
    enabled: enabled && Boolean(shopId),
    // Owners only; an employee gets a permission error from the database and
    // there is no point retrying it.
    retry: false,
  });
}

/**
 * How many transactions one export will carry.
 *
 * A cap is not optional — the browser has to hold the file in memory before it
 * can hand it over, and a query without a bound is a query that eventually
 * brings the tab down. It sits far above what a shop records in a day, so in
 * practice it is only ever reached by a year-to-date report on a very busy
 * shop.
 *
 * Hitting it is reported, not hidden. The export comes back with `truncated`
 * set, the file says so on its first lines, and the confirmation tells the
 * owner to narrow the range. A silently short ledger is the one outcome this
 * feature must never produce.
 */
export const EXPORT_ROW_LIMIT = 2000;

export interface ReportExportInput {
  shopId: string;
  shopName: string;
  currency: string;
  periodLabel: string;
  from: Date;
  to: Date;
  report: ShopReport;
}

/**
 * Exports the Reports page as a CSV file.
 *
 * A mutation rather than a query on purpose: this is a one-shot action that
 * produces a file, not state that anything on screen reads. Keeping it out of
 * the query cache means a large export cannot sit in memory for the rest of the
 * session, and `isPending` is exactly the "working" state the button needs.
 *
 * The transaction rows come from the same `listTransactions` read model the
 * ledger screen uses, so the file and the screen cannot disagree about what
 * happened — and they are already subject to the same row-level security.
 */
export function useReportExport() {
  return useMutation({
    mutationFn: async (input: ReportExportInput) => {
      const rows = await listTransactions({
        shopId: input.shopId,
        from: input.from.toISOString(),
        to: input.to.toISOString(),
        limit: EXPORT_ROW_LIMIT,
      });

      const truncated = rows.length >= EXPORT_ROW_LIMIT;
      const filename = reportFilename(input);
      const csv = buildReportCsv({
        shopName: input.shopName,
        currency: input.currency,
        periodLabel: input.periodLabel,
        from: input.from,
        to: input.to,
        report: input.report,
        rows,
        exportedAt: new Date(),
        truncated,
      });

      const delivered = downloadCsv(filename, csv);
      return { filename, rowCount: rows.length, truncated, delivered };
    },
  });
}

/**
 * A filename someone can find again.
 *
 * Shop and period are in it because a folder of `report.csv` files is useless
 * within a week, and the date is there for the same reason. The shop name is
 * slugified rather than pasted, because a name with a slash in it silently
 * becomes a path.
 */
function reportFilename(input: ReportExportInput): string {
  const parts = ["ravqen", input.shopName, input.periodLabel, csvDate(input.to)];
  return `${parts
    .map((part) => slugify(part))
    .filter(Boolean)
    .join("-")}.csv`;
}
