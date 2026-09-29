import { Outlet, createFileRoute } from "@tanstack/react-router";

import { AuthLayout } from "./-auth-parts";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

/**
 * Shared chrome for the auth pages. The route renders only the frame — each
 * child route owns its own form.
 */
function AuthPage() {
  return (
    <AuthLayout>
      <Outlet />
    </AuthLayout>
  );
}
