import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useSession } from "@/hooks/useSession";
import {
  BillingError,
  fetchAccountAccess,
  fetchSubscription,
  isBillingConfigured,
  presentPaywall,
  purchasePackage,
  refreshSubscription,
  type AccountAccess,
  type SubscriptionSummary,
} from "@/services/billing.service";
import type { Package } from "@revenuecat/purchases-js";

/**
 * The subscription state of the signed-in account.
 *
 * Three independent facts can make an account Pro, in order of authority:
 *
 *   1. Postgres (`public.my_plan()`), which knows both the gold/complimentary
 *      list and the entitlement rows RevenueCat's webhook writes. This is the
 *      same answer the database itself enforces paid features with.
 *   2. RevenueCat's live customer info, which is fresher than the webhook and
 *      matters immediately after a purchase.
 *
 * `isPro` is the union: a gold account, a paying account, and an account whose
 * webhook has landed all resolve to true, and none of them depends on a value
 * cached in the browser.
 */
export function useSubscription() {
  const { user, loading: sessionLoading } = useSession();
  const appUserId = user?.id ?? null;
  const configured = isBillingConfigured();
  const queryClient = useQueryClient();

  const signedIn = Boolean(appUserId) && !sessionLoading;

  const accessQuery = useQuery<AccountAccess, Error>({
    queryKey: ["account-access", user?.email ?? null],
    queryFn: fetchAccountAccess,
    enabled: signedIn,
    staleTime: 5 * 60_000,
    // Failing closed is the safe answer for a paid feature: an account that
    // cannot be verified is treated as not Pro, never the reverse.
    retry: 1,
  });

  const gold = accessQuery.data?.comped === true;
  const accountPro = accessQuery.data?.pro === true;

  const query = useQuery<SubscriptionSummary, BillingError>({
    queryKey: ["subscription", appUserId],
    queryFn: () => fetchSubscription(appUserId as string),
    enabled: configured && signedIn && !accountPro,
    staleTime: 60_000,
    retry: (count, error) =>
      // A wrong identity or a missing key will not fix itself by retrying.
      error.code !== "identity_changed" && error.code !== "not_configured" && count < 2,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["subscription", appUserId] });

  const purchase = useMutation({
    mutationFn: (rcPackage: Package) => purchasePackage(appUserId as string, rcPackage),
    onSettled: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ["account-access"] });
    },
  });

  const paywall = useMutation({
    mutationFn: () => presentPaywall(appUserId as string),
    onSettled: async () => {
      await invalidate();
      await queryClient.invalidateQueries({ queryKey: ["account-access"] });
    },
  });

  const refresh = useMutation({
    mutationFn: () => refreshSubscription(appUserId as string),
    onSuccess: (summary) => {
      queryClient.setQueryData(["subscription", appUserId], summary);
    },
  });

  return {
    ...query,
    appUserId,
    email: user?.email ?? null,
    configured,
    gold,
    accountPro,
    accessPending: accessQuery.isPending,
    purchase,
    paywall,
    refresh,
    isPro: gold || accountPro || (query.data?.entitled ?? false),
  };
}
