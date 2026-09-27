import { Link, Outlet, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  HandCoins,
  LayoutGrid,
  LogOut,
  MoreHorizontal,
  PackagePlus,
  Plus,
  ReceiptText,
  Settings,
  Store,
  Users,
  Wallet,
  Boxes,
} from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";

import { CreateShopDialog } from "@/components/app/CreateShopDialog";
import { LoadingState } from "@/components/app/AppChrome";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ActiveShopProvider, useActiveShop } from "@/hooks/useActiveShop";
import { signOut } from "@/services/auth.service";
import type { ShopWithRole } from "@/types/ravqen";

export const Route = createFileRoute("/_authenticated/app")({
  validateSearch: (search: Record<string, unknown>) => ({
    shop: typeof search["shop"] === "string" ? search["shop"] : undefined,
  }),
  component: AppLayout,
});

type AppModulePath =
  | "/app/pos"
  | "/app/inventory"
  | "/app/transactions"
  | "/app/restock"
  | "/app/debtors"
  | "/app/expenses"
  | "/app/reports"
  | "/app/employees"
  | "/app/settings";

type NavEntry = { to: AppModulePath; label: string; icon: typeof LayoutGrid };

const NAV_PRIMARY: NavEntry[] = [
  { to: "/app/pos", label: "POS", icon: LayoutGrid },
  { to: "/app/inventory", label: "Stock", icon: Boxes },
  { to: "/app/transactions", label: "Sales", icon: ReceiptText },
];

const NAV_MORE: NavEntry[] = [
  { to: "/app/restock", label: "Restock", icon: PackagePlus },
  { to: "/app/debtors", label: "Debtors", icon: HandCoins },
  { to: "/app/expenses", label: "Expenses", icon: Wallet },
  { to: "/app/reports", label: "Reports", icon: BarChart3 },
  { to: "/app/employees", label: "Employees", icon: Users },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

function AppLayout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return (
    <ActiveShopProvider>
      <AppChrome queryClient={queryClient} navigate={navigate} />
    </ActiveShopProvider>
  );
}

function AppChrome({
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

  if (loading) return <LoadingState label="Opening your shops…" />;

  if (hasNoShops || !activeShop) {
    return (
      <div className="min-h-screen bg-background">
        <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
          <Logo />
        </header>
        <main className="mx-auto w-full max-w-3xl px-5 pb-16 text-center">
          <h1 className="text-2xl">No shop yet</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Create your shop to start recording sales, stock and daily numbers.
          </p>
          <div className="mt-6 flex justify-center">
            <CreateShopDialog>
              <Button size="lg">
                <Plus /> Create your shop
              </Button>
            </CreateShopDialog>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Joined as staff? Ask the owner to add you — your shop appears here automatically.
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center gap-1 px-4 sm:px-6">
          <Link
            to="/dashboard"
            aria-label="Back to shop list"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0 flex-1 pl-1">
            <p className="truncate text-sm font-semibold leading-tight">{activeShop.name}</p>
            <p className="text-xs text-muted-foreground">
              {role === "owner" ? "Owner" : "Employee"} view
            </p>
          </div>
          {shops.length > 1 ? (
            <ShopSwitcher
              shops={shops}
              currentId={activeShop.id}
              onSelect={(id) => void navigate({ to: "/app", search: { shop: id } })}
            />
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void handleSignOut()}
            aria-label="Sign out"
          >
            <LogOut />
          </Button>
        </div>
      </header>

      <Outlet />

      {/* Mobile bottom navigation — thumb-reachable, three primary destinations. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          {NAV_PRIMARY.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}
          <MoreSheet items={NAV_MORE} />
        </div>
      </nav>
    </div>
  );
}

function NavItem({ to, label, icon: Icon }: NavEntry) {
  return (
    <Link
      to={to}
      search={{ shop: undefined }}
      className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors data-[status=active]:text-ink"
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}

function MoreSheet({ items }: { items: NavEntry[] }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          className="flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
        >
          <MoreHorizontal className="size-5" />
          More
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="px-4 pb-8 pt-4">
        <p className="px-2 pb-2 text-xs uppercase tracking-widest text-muted-foreground">More</p>
        <div className="grid grid-cols-2 gap-2">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              search={{ shop: undefined }}
              className="flex items-center gap-3 rounded-xl border border-border px-4 py-3.5 text-sm font-medium"
            >
              <item.icon className="size-5 text-ink-soft" />
              {item.label}
            </Link>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ShopSwitcher({
  shops,
  currentId,
  onSelect,
}: {
  shops: ShopWithRole[];
  currentId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Switch shop">
          <Store />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Switch shop</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {shops.map((shop) => (
          <DropdownMenuItem
            key={shop.id}
            onClick={() => onSelect(shop.id)}
            className={cn(shop.id === currentId && "bg-secondary")}
          >
            <span className="min-w-0 flex-1 truncate">{shop.name}</span>
            <span className="text-xs text-muted-foreground">{shop.role}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
