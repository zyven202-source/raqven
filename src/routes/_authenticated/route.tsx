import { Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { LoadingState } from "@/components/app/AppChrome";
import { StorageBlockedNotice } from "@/components/app/StorageBlockedNotice";
import { useSession } from "@/hooks/useSession";
import { useStorageAvailable } from "@/hooks/useStorageAvailable";

export const Route = createFileRoute("/_authenticated")({
  /**
   * Every signed-in screen is `noindex`.
   *
   * A crawler cannot sign in, so what it finds here is either a redirect to
   * `/auth/login` ("Page with redirect" in Search Console) or a loading state
   * with a page title — neither is a page worth indexing, and both dilute the
   * public pages that are. The rule lives on the layout rather than on each of
   * the twenty screens beneath it so a new screen cannot forget it.
   */
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow" },
      // No `og:` set here on purpose: the root head already supplies a card for
      // a shared link, and a signed-in URL is never the one to share.
    ],
  }),
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
