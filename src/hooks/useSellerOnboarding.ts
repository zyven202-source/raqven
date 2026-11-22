import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { shopsQueryKey } from "@/hooks/useShops";
import {
  becomeSeller,
  mySellerStall,
  type BecomeSellerInput,
} from "@/services/seller-onboarding.service";

export const sellerStallKey = ["market", "my-seller"] as const;

export function useMySellerStall(enabled = true) {
  return useQuery({
    queryKey: sellerStallKey,
    queryFn: mySellerStall,
    enabled,
    staleTime: 60_000,
  });
}

export function useBecomeSeller() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: BecomeSellerInput) => becomeSeller(input),
    onSuccess: () => {
      // A new stall is a new shop membership, and `/app` selects from that list.
      void client.invalidateQueries({ queryKey: shopsQueryKey });
      void client.invalidateQueries({ queryKey: sellerStallKey });
    },
  });
}
