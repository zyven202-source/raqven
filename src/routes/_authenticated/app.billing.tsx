import { createFileRoute } from "@tanstack/react-router";
import {
  BadgeCheck,
  CalendarClock,
  CreditCard,
  Crown,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  ErrorState,
  LoadingState,
  NoticeState,
  PageContainer,
  PageHeader,
} from "@/components/app/AppChrome";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";
import { BillingError, PRO_PLAN, type SubscriptionPackage } from "@/services/billing.service";

export const Route = createFileRoute("/_authenticated/app/billing")({
  head: () => ({ meta: [{ title: "Pith — Plan and billing" }] }),
  component: BillingPage,
});

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(date);
}

function periodLabel(pkg: SubscriptionPackage): string {
  if (pkg.period === "monthly") return "per month";
  if (pkg.period === "yearly") return "per year";
  return "";
}

/**
 * Plan and billing.
 *
 * Two ways an account can have Pro, and the screen has to show both honestly:
 *
 *   - a paid subscription, read from RevenueCat on every visit;
 *   - a complimentary ("gold") account, read from Postgres.
 *
 * A gold account never sees a buy button. That is the promise of the plan: the
 * account is not billed, not at sign-up and not later.
 */
function BillingPage() {
  const {
    data,
    isPending,
    error,
    refetch,
    configured,
    appUserId,
    purchase,
    paywall,
    refresh,
    isPro,
    gold,
    email,
  } = useSubscription();
  const [busyPackage, setBusyPackage] = useState<string | null>(null);

  if (!appUserId) return null;

  if (!configured && !gold) {
    return (
      <PageContainer>
        <PageHeader title="Plan and billing" />
        <NoticeState
          title="Subscriptions are not switched on yet"
          description="This build has no RevenueCat key configured, so there is nothing to buy. Everything already in your shop keeps working."
        />
      </PageContainer>
    );
  }

  // A gold account does not need RevenueCat at all, so it must not wait on it.
  if (isPending && !gold) {
    return <LoadingState label="Checking your plan…" onRetry={() => void refetch()} />;
  }

  if (error && !gold) {
    const billingError = error instanceof BillingError ? error : null;
    return (
      <PageContainer>
        <PageHeader title="Plan and billing" />
        <ErrorState
          title={
            billingError?.code === "identity_changed"
              ? "Reload to switch accounts"
              : "Couldn't check your plan"
          }
          message={error.message}
          onRetry={
            billingError?.code === "identity_changed"
              ? () => window.location.reload()
              : () => void refetch()
          }
        />
      </PageContainer>
    );
  }

  const packages = data?.packages ?? [];

  async function handlePurchase(pkg: SubscriptionPackage) {
    if (!appUserId) return;
    setBusyPackage(pkg.identifier);
    try {
      const result = await purchase.mutateAsync(pkg.rcPackage);
      if (result.customerInfo.entitlements.active["savo_freebuff_page_pro"]) {
        toast.success("Pith Pro is active. Every record stays available.");
      } else {
        toast.success("Payment received. Your plan will update in a moment.");
      }
    } catch (cause) {
      const billingError = cause instanceof BillingError ? cause : null;
      // A cancelled checkout is a decision, not a failure: no red toast.
      if (billingError?.code === "cancelled") {
        toast.message("Checkout closed. Nothing was charged.");
      } else {
        toast.error(cause instanceof Error ? cause.message : "The payment could not be completed.");
      }
    } finally {
      setBusyPackage(null);
    }
  }

  async function handlePaywall() {
    if (!appUserId) return;
    try {
      const result = await paywall.mutateAsync();
      if (result.customerInfo.entitlements.active["savo_freebuff_page_pro"]) {
        toast.success("Pith Pro is active. Every record stays available.");
      }
    } catch (cause) {
      const billingError = cause instanceof BillingError ? cause : null;
      if (billingError?.code === "cancelled") return;
      toast.error(cause instanceof Error ? cause.message : "The paywall could not be opened.");
    }
  }

  async function handleRefresh() {
    try {
      const summary = await refresh.mutateAsync();
      toast.success(
        summary.entitled ? "Your plan is up to date." : "No active subscription on this account.",
      );
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not refresh your plan.");
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="Plan and billing"
        subtitle="One plan for this account, on every shop you run."
        action={
          gold ? undefined : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={refresh.isPending}
            >
              <RefreshCw className={cn(refresh.isPending && "animate-spin")} aria-hidden />
              Refresh
            </Button>
          )
        }
      />

      {/* Gold. Stated first, because on this account nothing else applies. */}
      {gold ? (
        <section className="panel mb-3 flex items-start gap-3 border-caution/30 bg-caution-soft/50 p-4">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-caution/15 text-caution">
            <Crown className="size-4.5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Gold account</p>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
              {email ? `${email} has` : "This account has"} complimentary access to everything,
              permanently. Nothing is ever charged and no card is needed.
            </p>
          </div>
        </section>
      ) : null}

      {/* Current plan. The badge is driven by the entitlement, never by state. */}
      <section className="panel p-4" aria-labelledby="current-plan">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow" id="current-plan">
              Current plan
            </p>
            <p className="mt-1 font-display text-xl font-semibold">{isPro ? "Pith Pro" : "Free"}</p>
          </div>
          {isPro ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-positive-soft px-2.5 py-1 text-xs font-semibold text-positive">
              <BadgeCheck className="size-3.5" aria-hidden />
              {gold ? "Gold" : "Active"}
            </span>
          ) : (
            <span className="rounded-full bg-sunken px-2.5 py-1 text-xs font-semibold text-muted-foreground">
              No subscription
            </span>
          )}
        </div>

        {gold ? (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            All of your shop's records stay stored and available for as long as you keep the
            account. You never need to renew anything.
          </p>
        ) : isPro ? (
          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Renews</dt>
              <dd className="flex items-center gap-1.5 font-medium">
                <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
                {data?.willRenew ? formatDate(data.expiresAt ?? null) : "Cancelled at period end"}
              </dd>
            </div>
            {data?.expiresAt ? (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Access until</dt>
                <dd className="font-medium">{formatDate(data.expiresAt)}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Your records, sales and reports stay available. Pro covers the whole account and every
            shop you open.
          </p>
        )}

        {data?.managementUrl ? (
          <Button asChild variant="outline" className="mt-4 w-full">
            {/* Customer Center has no web build; RevenueCat's Customer Portal
                is the supported way to cancel or change a card on the web. */}
            <a href={data.managementUrl} target="_blank" rel="noreferrer">
              <CreditCard aria-hidden />
              Manage subscription
              <ExternalLink className="opacity-60" aria-hidden />
            </a>
          </Button>
        ) : null}
      </section>

      {/* The published price, stated plainly. Checkout shows the real amount. */}
      <section className="mt-4 panel p-4" aria-labelledby="pricing">
        <h2 id="pricing" className="text-sm font-semibold">
          {gold ? "What everyone else pays" : "Pith Pro"}
        </h2>
        <p className="mt-2 text-sm">
          <span className="font-display text-lg font-semibold">US${PRO_PLAN.monthlyUsd}</span>
          <span className="text-muted-foreground"> per month</span>
          <span className="mx-2 text-border" aria-hidden>
            |
          </span>
          <span className="font-display text-lg font-semibold">US${PRO_PLAN.yearlyUsd}</span>
          <span className="text-muted-foreground"> per year</span>
        </p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Pro adds staff accounts with their own access codes and keeps every one of your
          shop&rsquo;s records available. The yearly plan saves US${PRO_PLAN.yearlySavingUsd}{" "}
          against paying monthly for a year; your checkout shows the final amount in your own
          currency.
        </p>
      </section>

      {/* Plans. Prices and names are exactly what RevenueCat returns. */}
      {gold ? null : (
        <section className="mt-6" aria-labelledby="plans">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 id="plans" className="text-base font-semibold">
              {isPro ? "Change plan" : "Choose a plan"}
            </h2>
            {data?.offeringIdentifier ? (
              <span className="text-xs text-muted-foreground">{data.offeringIdentifier}</span>
            ) : null}
          </div>

          {packages.length === 0 ? (
            <NoticeState
              title="No plans are available right now"
              description="RevenueCat returned no packages for this offering. Nothing has been charged and your current plan is unchanged."
            />
          ) : (
            <ul className="space-y-2">
              {packages.map((pkg) => {
                const busy = busyPackage === pkg.identifier;
                return (
                  <li key={pkg.identifier} className="panel flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold leading-tight">{pkg.title}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {pkg.price} {periodLabel(pkg)}
                      </p>
                      {pkg.description ? (
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {pkg.description}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      className="shrink-0"
                      variant={pkg.period === "yearly" ? "default" : "outline"}
                      disabled={busyPackage !== null || paywall.isPending}
                      onClick={() => void handlePurchase(pkg)}
                    >
                      {busy ? "Opening…" : isPro ? "Switch" : "Subscribe"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <Button
            variant="ghost"
            className="mt-3 w-full"
            onClick={() => void handlePaywall()}
            disabled={paywall.isPending || busyPackage !== null}
          >
            {paywall.isPending ? "Opening paywall…" : "Open the RevenueCat paywall"}
          </Button>
          <p className="mt-2 text-center text-xs leading-relaxed text-muted-foreground">
            Pay by card or mobile wallet through RevenueCat's secure checkout. Prices are shown in
            the currency your store returns.
          </p>
        </section>
      )}
    </PageContainer>
  );
}
