import { createFileRoute } from "@tanstack/react-router";

import { ModulePage } from "@/components/app/ModulePage";

export const Route = createFileRoute("/_authenticated/app/expenses")({
  head: () => ({ meta: [{ title: "Expenses — RAVQEN" }] }),
  component: () => (
    <ModulePage
      title="Expenses"
      description="Daily shop spending recorded beside the takings."
      bulletPoints={[
        "Amount, category, description and payment method",
        "Optional receipt photo in private storage",
        "Editable by the person who recorded it; never deleted",
      ]}
    />
  ),
});
