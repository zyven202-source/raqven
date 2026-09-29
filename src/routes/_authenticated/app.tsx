import { Link, Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CreateShopDialog } from "@/components/app/CreateShopDialog";
import { FloatingNav } from "@/components/app/FloatingNav";
import { JoinShopSheet } from "@/components/app/JoinShopSheet";
import { LoadingState } from "@/components/app/AppChrome";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ActiveShopProvider, useActiveShop } from "@/hooks/useActiveShop";
import { signOut } from "@/services/auth.service";
import type { ShopWithRole } from "@/types/ravqen";

export const Route = createFileRoute("/_authenticated/app")({
  validateSearch: (search: Record<string, unknown>) => ({
    shop: typeof search["shop"] === "string" ? search["shop"] : undefined,
  }),
  component: AppLayout,
});

function AppLayout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return (
    <ActiveShopProvider>
      <AppShell queryClient={queryClient} navigate={navigate} />
    </ActiveShopProvider>
  );
}

function AppShell({
  queryClient,
  navigate,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const { activeShop, shops, role, loading, hasNoShops, selectShop } = useActiveShop();
  const { shop: searchShop } = Route.useSearch();

  // A ?shop= deep link wins when it matches one of the user's memberships.
  useEffect(() => {
    if (searchShop && searchShop !== activeShop?.id && shops.some((s) => s.id === searchShop)) {
      selectShop(searchShop);
    }
  }, [searchShop, shops, activeShop?.id, selectShop]);

  async function handleSignOut() {
    try {
      await signOut();
      queryClient.clear();
      await navigate({ to: "/auth/login", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  if (loading)
    return <LoadingState label="Opening your shop…" onRetry={() => window.location.reload()} />;

  if (hasNoShops || !activeShop) {
    return <NoShopState />;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="glass-header sticky top-0 z-30 backdrop-blur-2xl backdrop-saturate-150">
        <ShopBar
          shop={activeShop}
          shops={shops}
          role={role}
          onSwitch={(id) => void navigate({ to: "/app", search: { shop: id } })}
        />
      </header>

      <Outlet />

      <FloatingNav isOwner={role === "owner"} onSignOut={() => void handleSignOut()} />
    </div>
  );
}

/** The one line that says which shop every number on screen belongs to. */
function ShopBar({
  shop,
  shops,
  role,
  onSwitch,
}: {
  shop: ShopWithRole;
  shops: ShopWithRole[];
  role: "owner" | "employee" | null;
  onSwitch: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-1 px-2 sm:px-3">
      <Link
        to="/dashboard"
        className="grid size-10 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors active:bg-sunken"
        aria-label="All shops"
      >
        <Logo compact />
      </Link>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors active:bg-sunken"
        aria-label="Switch shop"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">{shop.name}</span>
          <span className="block text-[11px] leading-tight text-muted-foreground">
            {role === "owner" ? "Owner" : "Staff"}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="px-0 pb-8 pt-3">
          <p className="px-4 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Your shops
          </p>
          <ul className="list-divided">
            {shops.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSwitch(entry.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-sunken"
                >
                  <Store className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{entry.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {entry.role === "owner" ? "You own this shop" : "You work here"}
                    </span>
                  </span>
                  {entry.id === shop.id ? (
                    <Check className="size-4 shrink-0 text-positive" aria-hidden />
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/**
 * Shown when the signed-in user belongs to no shop. It offers both real ways
 * out — create a shop, or join one with a code — and never a dead end.
 */
function NoShopState() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="px-5 py-4">
        <Logo showTagline />
      </header>
      <main className="flex flex-1 flex-col justify-center px-5 pb-16">
        <h1 className="text-2xl">You are not in a shop yet</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          If you own a shop, create it here. If your employer gave you an access code, use that
          instead — it will connect you to the right shop.
        </p>

        <div className="mt-7 space-y-3">
          <CreateShopDialog>
            <Button className="h-12 w-full text-base">Create a shop</Button>
          </CreateShopDialog>
          <JoinShopSheet>
            <Button variant="outline" className="h-12 w-full text-base">
              I have an access code
            </Button>
          </JoinShopSheet>
        </div>
      </main>
    </div>
  );
}
