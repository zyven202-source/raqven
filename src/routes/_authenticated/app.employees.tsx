import { createFileRoute } from "@tanstack/react-router";

import { ModulePage } from "@/components/app/ModulePage";

export const Route = createFileRoute("/_authenticated/app/employees")({
  head: () => ({ meta: [{ title: "Employees — RAVQEN" }] }),
  component: () => (
    <ModulePage
      title="Employees"
      description="Owner-only: your team, their roles and till access codes."
      bulletPoints={[
        "Add employees and manage their active status (owner only, enforced by RLS)",
        "Issue per-employee access codes with expiry",
        "Suspend a member and their access ends everywhere, immediately",
      ]}
    />
  ),
});
