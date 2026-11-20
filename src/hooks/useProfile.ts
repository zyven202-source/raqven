import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getMyProfile, updateMyProfile } from "@/services/profile.service";
import type { Profile, ProfileInput } from "@/types/savo";

export const profileKeys = {
  me: ["profile", "me"] as const,
};

export function useMyProfile(enabled = true) {
  return useQuery({
    queryKey: profileKeys.me,
    queryFn: getMyProfile,
    enabled,
  });
}

export function useUpdateMyProfile() {
  const client = useQueryClient();
  return useMutation<Profile, Error, ProfileInput>({
    mutationFn: (patch) => updateMyProfile(patch),
    onSuccess: (profile) => {
      client.setQueryData(profileKeys.me, profile);
      void client.invalidateQueries({ queryKey: ["my-shops"] });
    },
  });
}
