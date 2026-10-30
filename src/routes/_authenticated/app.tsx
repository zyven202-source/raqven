import { Link, Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { CreateShopDialog } from "@/components/app/CreateShopDialog";
import { FloatingNav } from "@/components/app/FloatingNav";
import { SwipeArea } from "@/components/app/SwipeArea";
import { JoinShopSheet } from "@/components/app/JoinShopSheet";
import { LoadingState } from "@/components/app/AppChrome";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { SyncIndicator } from "@/components/app/SyncIndicator";
import { ActiveShopProvider, useActiveShop } from "@/hooks/useActiveShop";
import { signOut } from "@/services/auth.service";
import type { ShopWithRole } from "@/types/savo";

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
    <div className="min-h-screen bg-background/30">
      {/*
        The skip link. The app is a single-column list of links, so a keyboard
        user tabbing in lands on the shop bar and has to traverse the whole
        navigation on every single screen before reaching the content they
        asked for. This is the one line that fixes that, and it costs nothing
        to a pointer user because it is invisible until focused.
      */}
      <a href="#main" className="sr-only-focusable">
        Skip to the main content
      </a>
      <header className="glass-header sticky top-0 z-30 backdrop-blur-2xl backdrop-saturate-150">
        <ShopBar
          shop={activeShop}
          shops={shops}
          role={role}
          onSwitch={(id) => void navigate({ to: "/app", search: { shop: id } })}
        />
      </header>

      <div id="main" tabIndex={-1}>
        {/* The content area doubles as the horizontal swipe surface: it walks
            the dock's destinations left and right, and hands every other
            gesture straight back to the page. */}
        <SwipeArea isOwner={role === "owner"}>
          <Outlet />
        </SwipeArea>
      </div>

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
          {/*
            The role is not decoration — it is the one word that tells a member
            what they are allowed to do, and it is the word that stops an
            employee hunting for a settings screen they cannot open.

            It was `text-[11px] text-muted-foreground` and measured 3.41:1
            against the glass header, which is below the 4.5:1 that small text
            needs. `verify-contrast.mjs` found it by screenshotting the real
            rendered pixels. Hierarchy now comes from size and weight rather
            than from dropping the contrast.
          */}
          <span className="block text-xs font-medium leading-tight text-foreground">
            {role === "owner" ? "Owner" : "Staff"}
          </span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {/* The connectivity/sync pill — same footprint in every state, so the
          shop bar never jumps as the network changes. */}
      <SyncIndicator shopId={shop.id} />

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
    <div className="flex min-h-screen flex-col bg-background/30">
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
