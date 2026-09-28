import { ImageOff } from "lucide-react";

import { useStorageUrl } from "@/hooks/useStorageUrl";
import { cn } from "@/lib/utils";
import type { StorageBucket } from "@/services/storage.service";

/**
 * Renders an image stored in a private bucket.
 *
 * The database holds the object path, not a URL, so this resolves a signed URL
 * on demand. Until it resolves (or if it fails) an explicit placeholder is
 * shown — never a broken image icon.
 */
export function StorageImage({
  bucket,
  path,
  alt,
  className,
}: {
  bucket: StorageBucket;
  path: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const url = useStorageUrl(bucket, path);

  if (!path) {
    return (
      <div
        className={cn(
          "grid place-items-center rounded-lg bg-secondary text-muted-foreground",
          className,
        )}
        aria-hidden
      >
        <ImageOff className="size-4" />
      </div>
    );
  }

  if (!url) {
    return <div className={cn("animate-pulse rounded-lg bg-secondary", className)} aria-hidden />;
  }

  return <img src={url} alt={alt} className={cn("rounded-lg object-cover", className)} />;
}
