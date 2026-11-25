import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addListItem,
  advanceOrder,
  confirmSettlement,
  createList,
  deleteList,
  disputeOrder,
  fetchInbox,
  fetchInboxCounts,
  fetchListPayload,
  fetchMyLists,
  fetchOrderDocument,
  fetchReleases,
  fetchShopReputation,
  fetchShopReviews,
  labelSubmittedReview,
  markAllNotificationsRead,
  markNotificationRead,
  markReleaseRead,
  removeListItem,
  renameList,
  reportReview,
  rotateShareToken,
  setShareEnabled,
  submitReview,
  updateListItem,
} from "@/services/marketlink-commerce.service";
import type { MarketOrderState } from "@/types/marketlink";

export const commerceKeys = {
  inbox: ["commerce", "inbox"] as const,
  counts: ["commerce", "inbox-counts"] as const,
  releases: ["commerce", "releases"] as const,
  lists: ["commerce", "lists"] as const,
  list: (id: string | null, token: string | null) => ["commerce", "list", id, token] as const,
  document: (orderId: string) => ["commerce", "document", orderId] as const,
  reputation: (slug: string) => ["commerce", "reputation", slug] as const,
  reviews: (slug: string) => ["commerce", "reviews", slug] as const,
};

/** Orders, inbox and counts change while someone is looking at them. */
const LIVE = { refetchInterval: 30_000, refetchOnWindowFocus: true } as const;

// -------------------------------------------------------------------- inbox

export function useInbox(enabled = true) {
  return useQuery({ queryKey: commerceKeys.inbox, queryFn: () => fetchInbox(), enabled, ...LIVE });
}

export function useInboxCounts(enabled = true) {
  return useQuery({
    queryKey: commerceKeys.counts,
    queryFn: fetchInboxCounts,
    enabled,
    ...LIVE,
  });
}

export function useMarkNotificationRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: commerceKeys.inbox });
      void client.invalidateQueries({ queryKey: commerceKeys.counts });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: commerceKeys.inbox });
      void client.invalidateQueries({ queryKey: commerceKeys.counts });
    },
  });
}

// ----------------------------------------------------------------- releases

export function useReleases() {
  return useQuery({
    queryKey: commerceKeys.releases,
    queryFn: () => fetchReleases(),
    staleTime: 60_000,
  });
}

export function useMarkReleaseRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: markReleaseRead,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: commerceKeys.releases });
      void client.invalidateQueries({ queryKey: commerceKeys.counts });
    },
  });
}

// ------------------------------------------------------------------ circles

export function useMyLists(enabled = true) {
  return useQuery({ queryKey: commerceKeys.lists, queryFn: fetchMyLists, enabled });
}

export function useListPayload(listId: string | null, token: string | null) {
  return useQuery({
    queryKey: commerceKeys.list(listId, token),
    queryFn: () => fetchListPayload(listId, token),
    enabled: Boolean(listId || token),
  });
}

export function useCreateList() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createList,
    onSuccess: () => void client.invalidateQueries({ queryKey: commerceKeys.lists }),
  });
}

export function useRenameList() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameList(id, name),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: commerceKeys.lists });
      void client.invalidateQueries({ queryKey: ["commerce", "list"] });
    },
  });
}

export function useDeleteList() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteList,
    onSuccess: () => void client.invalidateQueries({ queryKey: commerceKeys.lists }),
  });
}

export function useRotateShareToken() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: rotateShareToken,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: commerceKeys.lists });
      void client.invalidateQueries({ queryKey: ["commerce", "list"] });
    },
  });
}

export function useSetShareEnabled() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setShareEnabled(id, enabled),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: commerceKeys.lists });
      void client.invalidateQueries({ queryKey: ["commerce", "list"] });
    },
  });
}

export function useAddListItem(listId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<Parameters<typeof addListItem>[0], "listId">) =>
      addListItem({ ...input, listId }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["commerce", "list"] });
      void client.invalidateQueries({ queryKey: commerceKeys.lists });
    },
  });
}

export function useUpdateListItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateListItem>[1] }) =>
      updateListItem(id, patch),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["commerce", "list"] }),
  });
}

export function useRemoveListItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: removeListItem,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["commerce", "list"] });
      void client.invalidateQueries({ queryKey: commerceKeys.lists });
    },
  });
}

// ------------------------------------------------------- settlement/receipts

export function useOrderDocument(orderId: string | null) {
  return useQuery({
    queryKey: commerceKeys.document(orderId ?? ""),
    queryFn: () => fetchOrderDocument(orderId as string),
    enabled: Boolean(orderId),
  });
}

export function useConfirmSettlement() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: confirmSettlement,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["marketlink", "my-orders"] });
      void client.invalidateQueries({ queryKey: ["marketlink", "orders"] });
      void client.invalidateQueries({ queryKey: ["commerce", "document"] });
    },
  });
}

export function useDisputeOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      disputeOrder(orderId, reason),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["marketlink", "my-orders"] });
      void client.invalidateQueries({ queryKey: ["marketlink", "orders"] });
    },
  });
}

export function useAdvanceOrder() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      status,
      note,
    }: {
      orderId: string;
      status: MarketOrderState;
      note?: string | null;
    }) => advanceOrder(orderId, status, note),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["marketlink", "orders"] });
      void client.invalidateQueries({ queryKey: ["commerce", "document"] });
    },
  });
}

// ------------------------------------------------------------------ reviews

export function useSubmitReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      orderId,
      rating,
      body,
    }: {
      orderId: string;
      rating: number;
      body: string | null;
    }) => {
      const review = await submitReview(orderId, rating, body);
      // The review is saved. Labelling it now means the seller's first visit to
      // the feedback section finds the label already stored.
      if (review) void labelSubmittedReview(review);
      return review;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["marketlink", "my-orders"] });
      void client.invalidateQueries({ queryKey: ["commerce", "reviews"] });
      void client.invalidateQueries({ queryKey: ["commerce", "reputation"] });
    },
  });
}

export function useReportReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ reviewId, reason }: { reviewId: string; reason: string | null }) =>
      reportReview(reviewId, reason),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["commerce", "reviews"] }),
  });
}

export function useShopReputation(slug: string) {
  return useQuery({
    queryKey: commerceKeys.reputation(slug),
    queryFn: () => fetchShopReputation(slug),
    enabled: Boolean(slug),
    staleTime: 60_000,
  });
}

export function useShopReviews(slug: string) {
  return useQuery({
    queryKey: commerceKeys.reviews(slug),
    queryFn: () => fetchShopReviews(slug),
    enabled: Boolean(slug),
    staleTime: 60_000,
  });
}
