import { createFileRoute } from "@tanstack/react-router";

import { ModulePage } from "@/components/app/ModulePage";

export const Route = createFileRoute("/_authenticated/app/settings")({
  head: () => ({ meta: [{ title: "Settings — RAVQEN" }] }),
  component: () => (
    <ModulePage
      title="Settings"
      description="Owner-managed shop configuration."
      bulletPoints={[
        "Shop name, location, phone and logo (private storage)",
        "Refunds on/off — enforced at the database, not just hidden in the UI",
        "Receipt header, footer and paper width",
      ]}
    />
  ),
});
