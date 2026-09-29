import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { LoadingState } from "@/components/app/AppChrome";
import { useActiveShop } from "@/hooks/useActiveShop";

export const Route = createFileRoute("/_authenticated/app/")({
  component: AppIndex,
});

/**
 * `/app` is only an entry point. Owners land on the day's numbers because that
 * is what they opened the app for; staff land straight on the till.
 */
function AppIndex() {
  const navigate = Route.useNavigate();
  const { isOwner, loading } = useActiveShop();

  useEffect(() => {
    if (loading) return;
    void navigate({
      to: isOwner ? "/app/overview" : "/app/pos",
      search: { shop: undefined },
      replace: true,
    });
  }, [navigate, isOwner, loading]);

  return <LoadingState label="Opening your shop…" />;
}
