import { Link, Outlet, createFileRoute } from "@tanstack/react-router";

import { Logo } from "@/components/brand/Logo";

export const Route = createFileRoute("/auth")({
  component: AuthLayout,
});

/**
 * Shared chrome for all four auth pages. The route itself renders nothing but
 * the shell — mode is decided entirely by the child route.
 */
function AuthLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-secondary/50">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
        <Link to="/" className="mx-auto" aria-label="RAVQEN home">
          <Logo showTagline />
        </Link>
        <Outlet />
      </div>
    </div>
  );
}
