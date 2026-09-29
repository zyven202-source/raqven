import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Query defaults are part of the product, not a tuning detail.
 *
 * Without them a dropped connection on a Kenyan mobile network produces three
 * silent retries and an indefinite "Loading…" — the exact failure this product
 * must not have. Two attempts with a short backoff, and a window-focus
 * refetch so a till that was in a pocket comes back to live numbers.
 */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 2 attempts rather than 3, with a quick backoff: fast, and it still
        // rides out a single dropped packet.
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 4000),
        // Data stays fresh for a moment so switching tabs does not re-hit the
        // network on every visit, while a till still sees new sales quickly.
        staleTime: 20_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        // A write is never silently retried: a duplicate sale is worse than an
        // honest error the cashier can see and act on.
        retry: 0,
      },
    },
  });
}

export const getRouter = () => {
  const queryClient = createQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
