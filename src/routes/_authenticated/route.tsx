import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { LoadingState } from "@/components/app/AppChrome";
import { StorageBlockedNotice } from "@/components/app/StorageBlockedNotice";
import { useSession } from "@/hooks/useSession";
import { useStorageAvailable } from "@/hooks/useStorageAvailable";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedGate,
});

/**
 * Pathless layout guarding every signed-in page. The database enforces what
 * this gate can only check: whether a session exists at all.
 *
 * This route is intentionally server-renderable. A client-only (`ssr: false`)
 * route makes navigation resolve through a separate client-only path, which
 * can leave the previous screen on display when that resolution stalls.
 */
function AuthenticatedGate() {
  const { session, loading, error } = useSession();
  const storageAvailable = useStorageAvailable();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session && !error) {
      void navigate({ to: "/auth/login", replace: true });
    }
  }, [loading, session, error, navigate]);

  if (loading) return <LoadingState label="Checking your session…" />;
  if (error || storageAvailable === false) {
    return <StorageBlockedNotice detail={error ?? undefined} />;
  }
  if (!session) return <LoadingState label="Redirecting to sign in…" />;

  return <Outlet />;
}
