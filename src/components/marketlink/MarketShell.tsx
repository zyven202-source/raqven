import { Link } from "@tanstack/react-router";
import { ArrowLeft, LayoutGrid, ShoppingBag } from "lucide-react";

import { Logo } from "@/components/brand/Logo";
import { useSession } from "@/hooks/useSession";

/**
 * The public commerce frame.
 *
 * Deliberately smaller than the marketing site's shell: a customer who followed
 * a shop link needs the shop, not five links about the software. The only
 * navigation is back to the marketplace and the customer's own requests.
 */
export function MarketShell({
  children,
  back,
}: {
  children: React.ReactNode;
  back?: { to: string; label: string } | undefined;
}) {
  const { user, loading } = useSession();

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-[var(--brand-line)] bg-[var(--brand-surface)]">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" aria-label="SAVO home" className="shrink-0">
            <Logo tone="light" />
          </Link>
          <span className="h-5 w-px bg-[var(--brand-line)]" aria-hidden />
          <Link
            to="/market"
            className="flex items-center gap-1.5 text-sm font-medium text-cream/80 transition-colors hover:text-cream"
          >
            <ShoppingBag className="size-4" aria-hidden />
            Marketplace
          </Link>
          <div className="ml-auto flex items-center gap-1">
            {/* The marketplace is public; the workspace is not. Only a signed-in
                visitor is offered the way back into their shops. */}
            {!loading && user ? (
              <Link
                to="/dashboard"
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium text-cream/80 transition-colors hover:bg-[var(--brand-raised)] hover:text-cream"
                aria-label="Back to your workspace"
              >
                <LayoutGrid className="size-3.5" aria-hidden />
                <span className="hidden sm:inline">Workspace</span>
              </Link>
            ) : null}
            <Link
              to="/account/orders"
              className="rounded-full px-3 py-1.5 text-xs font-medium text-cream/80 transition-colors hover:bg-[var(--brand-raised)] hover:text-cream"
            >
              My requests
            </Link>
            {!loading && !user ? (
              <Link
                to="/auth/login"
                className="rounded-full bg-[var(--brand-primary)] px-3.5 py-1.5 text-xs font-semibold text-[#04140e]"
              >
                Sign in
              </Link>
            ) : null}
          </div>
        </div>
        {back ? (
          <div className="mx-auto w-full max-w-6xl px-4 pb-2 sm:px-6">
            <Link
              to={back.to}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-3" aria-hidden />
              {back.label}
            </Link>
          </div>
        ) : null}
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-[var(--brand-line)] bg-[var(--brand-surface)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>SAVO Marketlink · every product comes from a real shop&rsquo;s inventory.</p>
          <nav aria-label="Marketplace footer" className="flex gap-4">
            <Link to="/market" className="hover:text-foreground">
              Browse all products
            </Link>
            <Link to="/support" className="hover:text-foreground">
              Support
            </Link>
            <Link to="/legal/terms" className="hover:text-foreground">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
