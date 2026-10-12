import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createAccessCode,
  deactivateAccessCode,
  getShop,
  listAccessCodes,
  listShopMembers,
  regenerateAccessCode,
  setAcceptsRefunds,
  setEmployeeJoining,
  updateMember,
  updateShop,
} from "@/services/shops.service";
import {
  getReceiptSettings,
  updateReceiptSettings,
  type UpdateReceiptSettingsInput,
} from "@/services/receipts.service";
import { shopsQueryKey } from "@/hooks/useShops";
import type { ShopUpdate } from "@/types/savo";

export const adminKeys = {
  shop: (shopId: string) => ["shop", shopId] as const,
  receiptSettings: (shopId: string) => ["receiptSettings", shopId] as const,
  members: (shopId: string) => ["members", shopId] as const,
  codes: (shopId: string) => ["accessCodes", shopId] as const,
};

export function useShopSettings(shopId: string) {
  return useQuery({
    queryKey: adminKeys.shop(shopId),
    queryFn: () => getShop(shopId),
    enabled: Boolean(shopId),
  });
}

export function useReceiptSettings(shopId: string) {
  return useQuery({
    queryKey: adminKeys.receiptSettings(shopId),
    queryFn: () => getReceiptSettings(shopId),
    enabled: Boolean(shopId),
  });
}

export function useShopMembers(shopId: string, enabled = true) {
  return useQuery({
    queryKey: adminKeys.members(shopId),
    queryFn: () => listShopMembers(shopId),
    enabled: enabled && Boolean(shopId),
    // Non-owners see only themselves; an error here is expected, not a bug.
    retry: false,
  });
}

export function useAccessCodes(shopId: string, enabled = true) {
  return useQuery({
    queryKey: adminKeys.codes(shopId),
    queryFn: () => listAccessCodes(shopId),
    enabled: enabled && Boolean(shopId),
    retry: false,
  });
}

function useShopWriteInvalidation(shopId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.shop(shopId) });
    void queryClient.invalidateQueries({ queryKey: adminKeys.receiptSettings(shopId) });
    void queryClient.invalidateQueries({ queryKey: shopsQueryKey });
    void queryClient.invalidateQueries({ queryKey: ["refunds", shopId] });
  };
}

export function useUpdateShop(shopId: string) {
  const invalidate = useShopWriteInvalidation(shopId);
  return useMutation({
    mutationFn: (patch: ShopUpdate) => updateShop(shopId, patch),
    onSuccess: invalidate,
  });
}

export function useSetRefunds(shopId: string) {
  const invalidate = useShopWriteInvalidation(shopId);
  return useMutation({
    mutationFn: (accepts: boolean) => setAcceptsRefunds(shopId, accepts),
    onSuccess: invalidate,
  });
}

/** Owner switch that decides whether anybody may join with the access code. */
export function useSetEmployeeJoining(shopId: string) {
  const invalidate = useShopWriteInvalidation(shopId);
  return useMutation({
    mutationFn: (enabled: boolean) => setEmployeeJoining(shopId, enabled),
    onSuccess: invalidate,
  });
}

export function useUpdateReceiptSettings(shopId: string) {
  const invalidate = useShopWriteInvalidation(shopId);
  return useMutation({
    mutationFn: (patch: UpdateReceiptSettingsInput) => updateReceiptSettings(shopId, patch),
    onSuccess: invalidate,
  });
}

export function useUpdateMember(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      memberId,
      patch,
    }: {
      memberId: string;
      patch: {
        role?: "owner" | "employee";
        status?: "active" | "suspended" | "removed";
        displayName?: string | null;
      };
    }) => updateMember(shopId, memberId, patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.members(shopId) });
      void queryClient.invalidateQueries({ queryKey: adminKeys.codes(shopId) });
      void queryClient.invalidateQueries({ queryKey: ["transactions", shopId] });
      void queryClient.invalidateQueries({ queryKey: shopsQueryKey });
    },
  });
}

export function useCreateAccessCode(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => createAccessCode(shopId, code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.codes(shopId) });
    },
  });
}

export function useRegenerateAccessCode(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => regenerateAccessCode(shopId, code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.codes(shopId) });
    },
  });
}

export function useDeactivateAccessCode(shopId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (codeId: string) => deactivateAccessCode(shopId, codeId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.codes(shopId) });
    },
  });
}
