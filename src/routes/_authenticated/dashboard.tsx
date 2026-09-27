import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, LogOut, Plus, Store } from "lucide-react";
import { toast } from "sonner";

import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyShops, useCreateShop } from "@/hooks/useShops";
import { useSession } from "@/hooks/useSession";
import { signOut } from "@/services/auth.service";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Your shops — RAVQEN" },
      { name: "description", content: "Open a shop to manage its sales, stock and numbers." },
      { property: "og:title", content: "Your shops — RAVQEN" },
      {
        property: "og:description",
        content: "Open a shop to manage its sales, stock and numbers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const { data: shops, isPending, error } = useMyShops();
  const createShop = useCreateShop();

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [businessType, setBusinessType] = useState("");

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await signOut();
    await navigate({ to: "/auth", replace: true });
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    try {
      const shop = await createShop.mutateAsync({
        name,
        city: city || null,
        businessType: businessType || null,
      });
      setName("");
      setCity("");
      setBusinessType("");
      toast.success(`${shop.name} created`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the shop.");
    }
  }

  return (
    <div className="min-h-screen bg-secondary/50">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-5 py-4">
          <Logo />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">{user?.email}</span>
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5 py-8">
        <h1 className="text-2xl sm:text-3xl">Your shops</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Each shop keeps its own products, sales, debtors and staff.
        </p>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <section className="space-y-3">
            {isPending ? (
              <>
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </>
            ) : error ? (
              <div className="surface-panel p-5 text-sm text-destructive">
                {error instanceof Error ? error.message : "Could not load your shops."}
              </div>
            ) : shops && shops.length > 0 ? (
              shops.map((shop) => (
                <article key={shop.id} className="surface-panel flex items-start gap-4 p-5">
                  <span className="gradient-ink grid size-11 shrink-0 place-items-center rounded-xl text-champagne">
                    <Store className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold">{shop.name}</h2>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {shop.city ? `${shop.city} · ` : ""}
                      {shop.currency} · created {formatDate(shop.created_at)}
                    </p>
                    <span className="mt-2 inline-flex rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium capitalize text-accent-foreground">
                      {shop.role}
                    </span>
                  </div>
                </article>
              ))
            ) : (
              <div className="surface-panel p-6 text-center">
                <Store className="mx-auto size-6 text-muted-foreground" aria-hidden />
                <h2 className="mt-3 text-base font-semibold">No shops yet</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Create your first shop to start recording sales and stock.
                </p>
              </div>
            )}
          </section>

          <section className="surface-panel h-fit p-5">
            <h2 className="text-base font-semibold">Add a shop</h2>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="shop-name">Shop name</Label>
                <Input
                  id="shop-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={2}
                  placeholder="Ravqen Mini Mart"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shop-type">Business type</Label>
                <Input
                  id="shop-type"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  placeholder="Retail shop, pharmacy, hardware…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="shop-city">Town or city</Label>
                <Input
                  id="shop-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Nairobi"
                />
              </div>
              <Button type="submit" className="w-full" disabled={createShop.isPending}>
                {createShop.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Create shop
              </Button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
