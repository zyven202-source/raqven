import { createFileRoute } from "@tanstack/react-router";

import { ModulePage } from "@/components/app/ModulePage";

export const Route = createFileRoute("/_authenticated/app/inventory")({
  head: () => ({ meta: [{ title: "Inventory — RAVQEN" }] }),
  component: () => (
    <ModulePage
      title="Inventory"
      description="Your full product list with live stock levels, prices and categories."
      bulletPoints={[
        "Products with buying price, selling price and low-stock alerts",
        "Categories and barcode / SKU lookup",
        "Product images stored privately per shop",
      ]}
    />
  ),
});
