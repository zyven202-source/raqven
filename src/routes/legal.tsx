import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * The frame every public policy page shares lives in
 * `src/components/app/LegalPage.tsx`. This route exists only so
 * `/legal/privacy`, `/legal/terms` and `/legal/refunds` sit under one path
 * prefix and one nav entry, and so the footer links are real routes rather than
 * hard-coded URLs.
 */
export const Route = createFileRoute("/legal")({
  component: () => <Outlet />,
});
