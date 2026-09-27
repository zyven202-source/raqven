import { createFileRoute } from "@tanstack/react-router";

import { ModulePage } from "@/components/app/ModulePage";

export const Route = createFileRoute("/_authenticated/app/transactions")({
  head: () => ({ meta: [{ title: "Transactions — RAVQEN" }] }),
  component: () => (
    <ModulePage
      title="Transactions"
      description="Every sale with its lines, payments and receipt."
      bulletPoints={[
        "Filterable daily history with receipt numbers",
        "Sale detail: items, unit prices, cost snapshot, discount and payment method",
        "Refunds (when the owner switches them on) linked to the original sale",
      ]}
    />
  ),
});
