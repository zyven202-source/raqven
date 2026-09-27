import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { LoadingState } from "@/components/app/AppChrome";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedGate,
});

/**
 * Pathless layout guarding every signed-in page. The database enforces what
 * this gate can only check: whether a session exists at all.
 */
function AuthenticatedGate() {
  const { session, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) {
      void navigate({ to: "/auth/login", replace: true });
    }
  }, [loading, session, navigate]);

  if (loading) return <LoadingState label="Checking your session…" />;
  if (!session) return <LoadingState label="Redirecting to sign in…" />;

  return <Outlet />;
}
