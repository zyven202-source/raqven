import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { LoadingState } from "@/components/app/AppChrome";

export const Route = createFileRoute("/_authenticated/app/")({
  component: AppIndex,
});

/** /app is just an entry point — land users in the POS module. */
function AppIndex() {
  const navigate = Route.useNavigate();
  useEffect(() => {
    void navigate({ to: "/app/pos", search: { shop: undefined }, replace: true });
  }, [navigate]);
  return <LoadingState label="Opening the till…" />;
}
