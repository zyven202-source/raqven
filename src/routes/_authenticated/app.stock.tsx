import { createFileRoute } from "@tanstack/react-router";

import { ModulePage } from "@/components/app/ModulePage";

export const Route = createFileRoute("/_authenticated/app/stock")({
  head: () => ({ meta: [{ title: "Stock — RAVQEN" }] }),
  component: () => (
    <ModulePage
      title="Stock movements"
      description="The append-only ledger behind every quantity on hand."
      bulletPoints={[
        "stock_in, sale, refund, adjustment — every change recorded with who and when",
        "Opening balances when you first list a product",
        "Audit trail you can reconcile against supplier invoices",
      ]}
    />
  ),
});
