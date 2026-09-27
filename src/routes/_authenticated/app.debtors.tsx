import { createFileRoute } from "@tanstack/react-router";

import { ModulePage } from "@/components/app/ModulePage";

export const Route = createFileRoute("/_authenticated/app/debtors")({
  head: () => ({ meta: [{ title: "Debtors — RAVQEN" }] }),
  component: () => (
    <ModulePage
      title="Debtors"
      description="Who owes what, and every repayment against it."
      bulletPoints={[
        "Customer balances maintained by credit sales and debtor payments",
        "Record repayments with method and reference",
        "Total owed across the shop, per customer history",
      ]}
    />
  ),
});
