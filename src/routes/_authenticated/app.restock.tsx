import { createFileRoute } from "@tanstack/react-router";

import { ModulePage } from "@/components/app/ModulePage";

export const Route = createFileRoute("/_authenticated/app/restock")({
  head: () => ({ meta: [{ title: "Restock — RAVQEN" }] }),
  component: () => (
    <ModulePage
      title="Restock"
      description="Low-stock list and one-tap supplier deliveries."
      bulletPoints={[
        "Auto list of products at or below their low-stock threshold",
        "Record a delivery: quantity and buying price in, ledger and stock updated atomically",
      ]}
    />
  ),
});
