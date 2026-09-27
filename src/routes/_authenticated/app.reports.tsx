import { createFileRoute } from "@tanstack/react-router";

import { ModulePage } from "@/components/app/ModulePage";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({ meta: [{ title: "Reports — RAVQEN" }] }),
  component: () => (
    <ModulePage
      title="Reports"
      description="Profit, stock value and cash — measured, not guessed."
      bulletPoints={[
        "Daily/weekly sales, profit (selling vs buying price) and expense totals",
        "Stock value at buying price, low-stock report",
        "Debtor aging and refund totals",
      ]}
    />
  ),
});
