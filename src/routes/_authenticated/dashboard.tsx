import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { LogOut, Plus } from "lucide-react";
import { toast } from "sonner";

import { CreateShopDialog, ShopCard } from "@/components/app/CreateShopDialog";
import { ErrorState, LoadingState } from "@/components/app/AppChrome";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { useMyShops } from "@/hooks/useShops";
import { signOut } from "@/services/auth.service";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your shops — RAVQEN" },
      { name: "description", content: "Open a shop to manage its sales, stock and numbers." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const shopsQuery = useMyShops();
  const navigate = useNavigate();

  const shops = shopsQuery.data ?? [];

  async function handleSignOut() {
    try {
      await signOut();
      await navigate({ to: "/auth/login", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-4">
        <Logo />
        <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
          <LogOut /> Sign out
        </Button>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 pb-16">
        <h1 className="text-2xl">Your shops</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Open a shop to manage its sales, stock and numbers.
        </p>

        {shopsQuery.isPending ? (
          <LoadingState label="Loading your shops…" />
        ) : shopsQuery.isError ? (
          <ErrorState
            message={shopsQuery.error.message}
            onRetry={() => void shopsQuery.refetch()}
          />
        ) : shops.length === 0 ? (
          <div className="surface-panel mt-8 p-8 text-center">
            <p className="font-medium">No shop yet</p>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Create your shop to start recording sales, stock and daily numbers.
            </p>
            <div className="mt-5 flex justify-center">
              <CreateShopDialog>
                <Button size="lg">
                  <Plus /> Create your shop
                </Button>
              </CreateShopDialog>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Joined a shop as staff? Ask the owner to add you — then it appears here.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8 space-y-3">
              {shops.map((shop) => (
                <div key={shop.id} className="relative">
                  <ShopCard shop={shop} role={shop.role} />
                  <Link
                    to="/app"
                    search={{ shop: shop.id }}
                    className="absolute inset-0 rounded-xl focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Open ${shop.name}`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-6">
              <CreateShopDialog>
                <Button variant="outline">
                  <Plus /> Create another shop
                </Button>
              </CreateShopDialog>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
