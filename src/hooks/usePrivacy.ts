/**
 * Consent, data-subject requests and the activity log.
 *
 * `routes/components → hooks → services → Supabase client`, so the routes
 * never touch the Supabase client directly.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { listMemberDirectory } from "@/services/shops.service";
import {
  buildPersonalDataExport,
  deleteAccount,
  downloadJsonFile,
  listAuditLog,
  listMyConsent,
  listMyDataRequests,
  lodgeDataRequest,
  recordConsent,
  summariseConsent,
  withdrawDataRequest,
  type ConsentType,
  type DataRequestType,
} from "@/services/privacy.service";

export const privacyKeys = {
  consent: ["privacy", "consent"] as const,
  requests: ["privacy", "requests"] as const,
  audit: (shopId: string) => ["privacy", "audit", shopId] as const,
  members: (shopId: string) => ["privacy", "members", shopId] as const,
};

export function useMyConsent() {
  return useQuery({
    queryKey: privacyKeys.consent,
    queryFn: listMyConsent,
    staleTime: 5 * 60_000,
  });
}

export function useConsentState() {
  const query = useMyConsent();
  return { ...query, state: summariseConsent(query.data ?? []) };
}

export function useRecordConsent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: ConsentType; granted: boolean; source?: "signup" | "settings" }) =>
      recordConsent(input.type, input.granted, input.source ?? "settings"),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: privacyKeys.consent });
    },
  });
}

export function useMyDataRequests() {
  return useQuery({
    queryKey: privacyKeys.requests,
    queryFn: listMyDataRequests,
    staleTime: 60_000,
  });
}

export function useLodgeDataRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      type: DataRequestType;
      details?: string | null;
      shopId?: string | null;
    }) => lodgeDataRequest(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: privacyKeys.requests });
    },
  });
}

export function useWithdrawDataRequest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => withdrawDataRequest(requestId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: privacyKeys.requests });
    },
  });
}

/** Builds the export and hands it to the browser as a real file download. */
export function useExportMyData() {
  return useMutation({
    mutationFn: async () => {
      const payload = await buildPersonalDataExport();
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJsonFile(`savo-my-data-${stamp}.json`, payload);
      return payload;
    },
  });
}

export function useDeleteAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      // Nothing this client holds is trustworthy after the profile is gone.
      client.clear();
    },
  });
}

export function useAuditLog(shopId: string, limit = 100) {
  return useQuery({
    queryKey: privacyKeys.audit(shopId),
    queryFn: () => listAuditLog(shopId, limit),
    enabled: shopId.length > 0,
    staleTime: 30_000,
  });
}

/**
 * User id → display name for the shop, so an audit entry can name a person
 * instead of printing a UUID. Returns a `Map` because it is only ever a lookup.
 */
export function useMemberNames(shopId: string) {
  return useQuery({
    queryKey: privacyKeys.members(shopId),
    queryFn: () => listMemberDirectory(shopId),
    enabled: shopId.length > 0,
    staleTime: 60_000,
  });
}
