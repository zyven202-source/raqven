import { createFileRoute } from "@tanstack/react-router";

import { ModulePage } from "@/components/app/ModulePage";

export const Route = createFileRoute("/_authenticated/app/pos")({
  head: () => ({ meta: [{ title: "POS — RAVQEN" }] }),
  component: () => (
    <ModulePage
      title="Point of sale"
      description="The fast path from shelf to receipt — built next on this foundation."
      bulletPoints={[
        "Product search and barcode entry",
        "Cart with quantity, discount and M-Pesa / cash / credit payment",
        "Automatic receipt numbers and stock deduction in one transaction",
        "Credit sales recorded straight to the debtor's account",
      ]}
    />
  ),
});
