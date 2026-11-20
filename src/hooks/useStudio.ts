import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  saveStudioPhoto,
  type SaveStudioPhotoInput,
  type SaveStudioPhotoResult,
} from "@/services/studio.service";

/** Saves a rendered Studio photo onto a product, and its listing when present. */
export function useSaveStudioPhoto(shopId: string) {
  const client = useQueryClient();
  return useMutation<SaveStudioPhotoResult, Error, SaveStudioPhotoInput>({
    mutationFn: (input) => saveStudioPhoto(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["products", shopId] });
      void client.invalidateQueries({ queryKey: ["marketlink", "listings", shopId] });
      void client.invalidateQueries({ queryKey: ["marketlink", "feed"] });
      void client.invalidateQueries({ queryKey: ["marketlink", "storefront", shopId] });
    },
  });
}
