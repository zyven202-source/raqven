import { useQuery } from "@tanstack/react-query";

import { signedUrl, type StorageBucket } from "@/services/storage.service";

/**
 * Turns a stored object path into a URL the browser can show.
 *
 * The buckets are private, so a raw object URL would 403. Signed URLs are
 * cached for slightly less than their lifetime and refreshed automatically.
 */
export function useStorageUrl(bucket: StorageBucket, path: string | null | undefined) {
  const query = useQuery({
    queryKey: ["signedUrl", bucket, path ?? ""],
    queryFn: () => signedUrl(bucket, path as string, 3600),
    enabled: Boolean(path),
    staleTime: 45 * 60 * 1000,
    retry: false,
  });

  return query.data ?? null;
}
