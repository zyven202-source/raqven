import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardList, PackagePlus, Users } from "lucide-react";
import { useEffect } from "react";

import { CreateShopDialog } from "@/components/app/CreateShopDialog";
import { LoadingState } from "@/components/app/AppChrome";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/useSession";
import { useMyShops } from "@/hooks/useShops";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Set up — RAVQEN" }] }),
  component: OnboardingPage,
});

const STEPS = [
  {
    icon: ClipboardList,
    title: "Create your shop",
    body: "Name, business type and location. You become the owner with full control.",
  },
  {
    icon: PackagePlus,
    title: "Add your products",
    body: "Categories, buying and selling prices, opening stock — or import later.",
  },
  {
    icon: Users,
    title: "Bring in your staff",
    body: "Employees get their own access codes and can sell, restock and record expenses.",
  },
] as const;

function OnboardingPage() {
  const navigate = Route.useNavigate();
  const { loading: sessionLoading } = useSession();
  const shopsQuery = useMyShops();

  if (sessionLoading || shopsQuery.isPending) {
    return <LoadingState label="Loading…" />;
  }

  const shops = shopsQuery.data ?? [];
  const shop = shops[0] ?? null;

  if (shop) {
    return <RedirectToShop shopId={shop.id} />;
  }

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-2xl px-5 pb-16 pt-10">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Getting started
        </p>
        <h1 className="mt-2 text-3xl">Three steps to your first record</h1>

        <ol className="mt-8 space-y-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="surface-panel flex items-start gap-4 p-5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-secondary font-display text-base font-semibold text-ink">
                {index + 1}
              </span>
              <div>
                <p className="font-medium">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
              <step.icon className="ml-auto size-5 shrink-0 text-ink-soft" aria-hidden />
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <CreateShopDialog>
            <Button size="lg" className="h-12">
              Create your shop <ArrowRight />
            </Button>
          </CreateShopDialog>
          <Button asChild size="lg" variant="outline" className="h-12">
            <Link to="/dashboard">Back to my shops</Link>
          </Button>
        </div>
      </main>
    </div>
  );
}

function RedirectToShop({ shopId }: { shopId: string }) {
  const navigate = Route.useNavigate();
  useEffect(() => {
    void navigate({ to: "/app", search: { shop: shopId }, replace: true });
  }, [navigate, shopId]);
  return <LoadingState label="Opening your shop…" />;
}
