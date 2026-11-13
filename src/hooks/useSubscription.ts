import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useSession } from "@/hooks/useSession";
import {
  BillingError,
  fetchComplimentaryAccess,
  fetchSubscription,
  isBillingConfigured,
  presentPaywall,
  purchasePackage,
  refreshSubscription,
  type SubscriptionSummary,
} from "@/services/billing.service";
import type { Package } from "@revenuecat/purchases-js";

/**
 * The subscription state of the signed-in account.
 *
 * Two independent facts decide whether the account has Pro:
 *
 *   1. RevenueCat says an entitlement is active (a real, paid subscription).
 *   2. Postgres says the account's verified email is on the complimentary list
 *      (the gold accounts). This is checked separately and deliberately does
 *      NOT depend on RevenueCat being configured — a gold account must never
 *      lose access because the store key is missing.
 *
 * `isPro` is the OR of the two. Neither is cached in localStorage, and the
 * complementary check runs even when billing is switched off.
 */
export function useSubscription() {
  const { user, loading: sessionLoading } = useSession();
  const appUserId = user?.id ?? null;
  const configured = isBillingConfigured();
  const queryClient = useQueryClient();

  const signedIn = Boolean(appUserId) && !sessionLoading;

  const comped = useQuery<boolean, Error>({
    queryKey: ["comped", user?.email ?? null],
    queryFn: fetchComplimentaryAccess,
    enabled: signedIn,
    staleTime: 5 * 60_000,
    // Failing closed is the safe answer for a paid feature: an account that
    // cannot be verified is treated as not comped, never the reverse.
    retry: 1,
  });

  const query = useQuery<SubscriptionSummary, BillingError>({
    queryKey: ["subscription", appUserId],
    queryFn: () => fetchSubscription(appUserId as string),
    enabled: configured && signedIn && !comped.data,
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
    },
  });

  const paywall = useMutation({
    mutationFn: () => presentPaywall(appUserId as string),
    onSettled: async () => {
      await invalidate();
    },
  });

  const refresh = useMutation({
    mutationFn: () => refreshSubscription(appUserId as string),
    onSuccess: (summary) => {
      queryClient.setQueryData(["subscription", appUserId], summary);
    },
  });

  const gold = comped.data === true;

  return {
    ...query,
    appUserId,
    email: user?.email ?? null,
    configured,
    gold,
    comped,
    purchase,
    paywall,
    refresh,
    isPro: gold || (query.data?.entitled ?? false),
  };
}
