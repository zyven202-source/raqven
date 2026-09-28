import { Link, Outlet, createFileRoute } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { useStorageAvailable } from "@/hooks/useStorageAvailable";

export const Route = createFileRoute("/auth")({
  component: AuthLayout,
});

/**
 * Shared chrome for the auth pages. The route itself renders nothing but the
 * shell — each child route owns its own form.
 */
function AuthLayout() {
  const storageAvailable = useStorageAvailable();

  return (
    <div className="flex min-h-screen flex-col bg-secondary/50">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <Link to="/" className="mx-auto" aria-label="RAVQEN home">
          <Logo showTagline />
        </Link>

        {storageAvailable === false ? (
          <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <p>
              This browser is blocking website storage, so signing in here will not stick. Open
              RAVQEN in its own tab instead of inside an embedded preview.
            </p>
          </div>
        ) : null}

        <Outlet />
      </div>
    </div>
  );
}
