import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { KeyRound, Store } from "lucide-react";

import { CreateShopDialog } from "@/components/app/CreateShopDialog";
import { ErrorState, LoadingState, PageContainer } from "@/components/app/AppChrome";
import { JoinShopSheet } from "@/components/app/JoinShopSheet";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { useMyShops } from "@/hooks/useShops";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "SAVO — Set up" }] }),
  component: OnboardingPage,
});

/**
 * The one question a new account has to answer: do you run a shop, or do you
 * work in one? Both answers lead straight to a real operation — creating a
 * shop, or redeeming an access code. There is no third "skip for now" that
 * would leave the account stranded.
 */
function OnboardingPage() {
  const navigate = Route.useNavigate();
  const { loading: sessionLoading } = useSession();
  const shopsQuery = useMyShops();

  const shop = (shopsQuery.data ?? [])[0];

  // The redirect only applies to someone who *arrived* already belonging to a
  // shop. A shop created from this page must not trigger it: the confirmation
  // step holds the staff access code, which is only ever shown once, and
  // navigating away would destroy it before the owner could read it.
  const hadShopOnArrival = useRef<boolean | null>(null);
  useEffect(() => {
    if (sessionLoading || !shopsQuery.isSuccess) return;
    if (hadShopOnArrival.current === null) {
      hadShopOnArrival.current = Boolean(shop);
    }
    if (hadShopOnArrival.current) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [sessionLoading, shopsQuery.isSuccess, shop, navigate]);

  if (sessionLoading || shopsQuery.isLoading) {
    return <LoadingState label="Checking your account…" />;
  }

  if (shopsQuery.isError) {
    return (
      <PageContainer>
        <ErrorState message={shopsQuery.error.message} onRetry={() => void shopsQuery.refetch()} />
      </PageContainer>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background/30">
      <header className="px-5 py-5">
        <Logo showTagline />
      </header>

      <PageContainer className="flex-1 pb-16 pt-4">
        <h1 className="text-[1.5rem] leading-tight">How will you use SAVO?</h1>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          This decides what you set up next. You can always add the other one later.
        </p>

        <div className="mt-7 space-y-3">
          <CreateShopDialog>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors active:bg-sunken"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-ink-deep text-champagne">
                <Store className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold">I own a shop</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  Create your shop and become its owner.
                </span>
              </span>
            </button>
          </CreateShopDialog>

          <JoinShopSheet>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors active:bg-sunken"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-sunken text-muted-foreground">
                <KeyRound className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.9375rem] font-semibold">I work in a shop</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  Enter the access code your employer gave you.
                </span>
              </span>
            </button>
          </JoinShopSheet>
        </div>

        <Button
          variant="ghost"
          className="mt-6 w-full"
          onClick={() => void navigate({ to: "/dashboard" })}
        >
          Skip for now
        </Button>
      </PageContainer>
    </div>
  );
}
