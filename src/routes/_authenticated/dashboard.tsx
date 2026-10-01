import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus, Store } from "lucide-react";
import { toast } from "sonner";

import { CreateShopDialog } from "@/components/app/CreateShopDialog";
import { JoinShopSheet } from "@/components/app/JoinShopSheet";
import { EmptyState, ErrorState, LoadingState, PageContainer } from "@/components/app/AppChrome";
import { StorageImage } from "@/components/app/StorageImage";
import { SectionLabel } from "@/components/app/primitives";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { useMyShops } from "@/hooks/useShops";
import { signOut } from "@/services/auth.service";
import { businessTypeLabel } from "@/services/shops.service";
import { STORAGE_BUCKETS } from "@/types/ravqen";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your shops — RAVQEN" },
      { name: "description", content: "Open a shop to manage its sales, stock and numbers." },
    ],
  }),
  component: DashboardPage,
});

/**
 * The hub between accounts and shops. It lists only shops the signed-in user
 * genuinely belongs to — whatever is in their database, nothing else — and
 * offers the two real ways forward: run a shop, or join one.
 */
function DashboardPage() {
  const shopsQuery = useMyShops();
  const { user } = useSession();
  const navigate = useNavigate();

  const shops = shopsQuery.data ?? [];
  const firstName = user?.user_metadata?.["full_name"]?.toString().split(" ")[0];

  async function handleSignOut() {
    try {
      await signOut();
      await navigate({ to: "/auth/login", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background/30">
      <header className="border-b border-border px-4 py-3.5">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between">
          <Logo />
          <Button variant="ghost" size="sm" onClick={() => void handleSignOut()}>
            Sign out
          </Button>
        </div>
      </header>

      <PageContainer className="flex-1 pb-16 pt-6">
        <h1 className="text-[1.375rem] leading-tight">
          {firstName ? `Hello, ${firstName}` : "Your shops"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {shops.length === 0
            ? "Set up a shop to start recording sales and stock."
            : "Pick a shop to open its till."}
        </p>

        {shopsQuery.isLoading ? (
          <LoadingState label="Loading your shops…" />
        ) : shopsQuery.isError ? (
          <div className="mt-6">
            <ErrorState
              message={shopsQuery.error.message}
              onRetry={() => void shopsQuery.refetch()}
            />
          </div>
        ) : shops.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="No shop yet"
              description="Create your shop to start selling, managing stock and tracking your business."
              action={
                <CreateShopDialog>
                  <Button className="h-12 px-6">Create shop</Button>
                </CreateShopDialog>
              }
            />
            <div className="mt-4 flex justify-center">
              <JoinShopSheet>
                <Button variant="outline" className="h-11">
                  I have an access code
                </Button>
              </JoinShopSheet>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-5">
              <SectionLabel>Shops</SectionLabel>
              <ul className="list-divided">
                {shops.map((shop) => (
                  <li key={shop.id}>
                    <Link
                      to="/app"
                      search={{ shop: shop.id }}
                      className="flex min-h-14 items-center gap-3 py-3 active:opacity-70"
                    >
                      <StorageImage
                        bucket={STORAGE_BUCKETS.shopLogos}
                        path={shop.logo_url}
                        alt={`${shop.name} logo`}
                        className="size-10 shrink-0 rounded-lg"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{shop.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[businessTypeLabel(shop.business_type), shop.location]
                            .filter((part) => part && part !== "—")
                            .join(" · ") || "No details yet"}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs capitalize text-muted-foreground">
                        {shop.role}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <CreateShopDialog>
                <Button variant="outline" className="h-11">
                  <Plus className="size-4" /> Add another shop
                </Button>
              </CreateShopDialog>
              <JoinShopSheet>
                <Button variant="ghost" className="h-11">
                  <Store className="size-4" /> Join with a code
                </Button>
              </JoinShopSheet>
            </div>
          </>
        )}
      </PageContainer>
    </div>
  );
}
