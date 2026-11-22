import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Plus, ShoppingBag, Store } from "lucide-react";
import { toast } from "sonner";

import { CreateShopDialog } from "@/components/app/CreateShopDialog";
import { JoinShopSheet } from "@/components/app/JoinShopSheet";
import { BecomeSellerDialog } from "@/components/marketlink/BecomeSellerDialog";
import { ErrorState, LoadingState, PageContainer } from "@/components/app/AppChrome";
import { StorageImage } from "@/components/app/StorageImage";
import { StatusBadge } from "@/components/app/primitives";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { useMyShops } from "@/hooks/useShops";
import { PHOTOGRAPHY, creditLine } from "@/lib/photography";
import { signOut } from "@/services/auth.service";
import { businessTypeLabel } from "@/services/shops.service";
import { STORAGE_BUCKETS } from "@/types/savo";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "SAVO — Your workspace" },
      { name: "description", content: "Choose where you want to work." },
    ],
  }),
  component: DashboardPage,
});

/**
 * The hub between accounts and shops.
 *
 * It lists only shops the signed-in user genuinely belongs to — whatever is in
 * their database, nothing else — and offers the two real ways forward: run a
 * shop, or join one.
 *
 * The photograph behind it is a shop interior, dimmed enough that the glass
 * panel is the thing in focus. It is one image, lazy-decoded and sized in the
 * markup, so the page never jumps as it arrives.
 */
function DashboardPage() {
  const shopsQuery = useMyShops();
  const { user } = useSession();
  const navigate = useNavigate();

  const shops = shopsQuery.data ?? [];
  const firstName = user?.user_metadata?.["full_name"]?.toString().split(" ")[0];
  const photo = PHOTOGRAPHY.shops;

  async function handleSignOut() {
    try {
      await signOut();
      await navigate({ to: "/auth/login", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out.");
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      {/* ------------------------------------------------------- photograph */}
      <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden bg-[var(--savo-night)]">
        <img
          src={photo.src}
          alt=""
          aria-hidden
          width={photo.width}
          height={photo.height}
          decoding="async"
          className="size-full object-cover opacity-90"
          style={{ objectPosition: photo.focal }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,17,16,0.62)_0%,rgba(11,17,16,0.72)_45%,rgba(11,17,16,0.9)_100%)]" />
      </div>

      <header className="border-b border-[var(--brand-line)] bg-[var(--brand-raised)]">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-4 py-3.5">
          <Logo />
          <Button
            variant="ghost"
            size="sm"
            className="text-[var(--cream)]/80 hover:text-[var(--cream)]"
            onClick={() => void handleSignOut()}
          >
            Sign out
          </Button>
        </div>
      </header>

      <PageContainer className="flex-1 pb-16 pt-6">
        <div className="bg-[var(--brand-raised)] rounded-2xl border border-[var(--brand-line)] p-5 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.9)] sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--mint)]">
            Your workspace
          </p>
          <h1 className="mt-2 font-display text-[1.75rem] leading-tight sm:text-[2rem]">
            {firstName ? `Hello, ${firstName}` : "Choose where you want to work."}
          </h1>
          <p className="mt-1.5 text-sm text-[var(--cream)]/70">
            {shops.length === 0
              ? "Set up a shop to start recording sales and stock."
              : "Choose where you want to work. Your data stays with the shop you open."}
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
            <div className="mt-6">
              <div className="relative overflow-hidden rounded-xl border border-[var(--brand-line)]">
                <img
                  src={PHOTOGRAPHY.empty.src}
                  alt={PHOTOGRAPHY.empty.alt}
                  aria-hidden
                  width={PHOTOGRAPHY.empty.width}
                  height={PHOTOGRAPHY.empty.height}
                  loading="lazy"
                  decoding="async"
                  className="h-32 w-full object-cover opacity-60 sm:h-40"
                />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,17,16,0.35),rgba(11,17,16,0.9))]" />
                <div className="absolute inset-0 flex flex-col justify-end p-4">
                  <p className="font-display text-lg">No shop yet</p>
                  <p className="mt-0.5 text-xs text-[var(--cream)]/70">
                    Create a shop, join one with a code, or open a stall on SAVO Market and start
                    selling today.
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <CreateShopDialog>
                  <Button className="h-12 w-full sm:w-auto sm:px-6">
                    <Plus className="size-4" /> Create shop
                  </Button>
                </CreateShopDialog>
                <JoinShopSheet>
                  <Button variant="outline" className="h-12 w-full sm:w-auto">
                    <Store className="size-4" /> I have an access code
                  </Button>
                </JoinShopSheet>
                <BecomeSellerDialog>
                  <Button variant="outline" className="h-12 w-full sm:w-auto">
                    <ShoppingBag className="size-4" /> Sell without a shop
                  </Button>
                </BecomeSellerDialog>
              </div>
            </div>
          ) : (
            <>
              <ul className="mt-5 space-y-2">
                {shops.map((shop) => (
                  <li key={shop.id}>
                    <Link
                      to="/app"
                      search={{ shop: shop.id }}
                      className="group flex min-h-16 items-center gap-3 rounded-xl border border-[var(--brand-line)] bg-[var(--brand-raised)] px-3.5 py-3 transition-colors hover:border-[var(--mint)]/40 hover:bg-[var(--brand-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mint)]/50 active:bg-[var(--brand-raised)]"
                    >
                      <StorageImage
                        bucket={STORAGE_BUCKETS.shopLogos}
                        path={shop.logo_url}
                        alt={`${shop.name} logo`}
                        className="size-11 shrink-0 rounded-lg"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.95rem] font-semibold">
                          {shop.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[var(--cream)]/65">
                          {[businessTypeLabel(shop.business_type), shop.location]
                            .filter((part) => part && part !== "—")
                            .join(" · ") || "No details yet"}
                        </span>
                      </span>
                      <StatusBadge tone={shop.role === "owner" ? "info" : "neutral"}>
                        {shop.role === "owner" ? "Owner" : "Staff"}
                      </StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--brand-line)] pt-4">
                <CreateShopDialog>
                  <Button variant="outline" className="h-11">
                    <Plus className="size-4" /> Add another shop
                  </Button>
                </CreateShopDialog>
                <JoinShopSheet>
                  <Button variant="ghost" className="h-11 text-[var(--cream)]/80">
                    <Store className="size-4" /> Join with a code
                  </Button>
                </JoinShopSheet>
              </div>
            </>
          )}
        </div>

        {/*
          Marketlink sits outside the shop panel on purpose: it is public, it
          needs no shop membership, and a customer who came to browse should not
          have to open somebody's till first. The panel below it stays exactly as
          it was — the shops, their roles, and the two ways to join one.
        */}
        <Link
          to="/market"
          className="mt-4 flex items-center gap-3 rounded-2xl border border-[var(--mint)]/30 bg-[var(--brand-raised)] px-4 py-3.5 transition-colors hover:border-[var(--mint)]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mint)]/50"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--mint)]/15 text-[var(--mint)]">
            <ShoppingBag className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Marketlink</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-[var(--cream)]/70">
              Browse real products from every shop — no shop of your own needed.
            </span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-[var(--cream)]/60" aria-hidden />
        </Link>

        <p className="mt-4 text-center text-[11px] text-[var(--cream)]/40">{creditLine(photo)}</p>
      </PageContainer>
    </div>
  );
}
