/**
 * Storage.
 *
 * The three buckets are PRIVATE and their policies parse the first path segment
 * as the shop id, so every object must be keyed `<shop_id>/<filename>` or the
 * upload is rejected by the database.
 *
 * Because the buckets are private, the columns that hold a picture hold the
 * *object path*, not a URL — a stored URL would silently expire. Display code
 * asks for a short-lived signed URL instead.
 */
import { supabase } from "@/integrations/supabase/client";
import { STORAGE_BUCKETS } from "@/types/ravqen";

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

const MAX_BYTES: Record<string, number> = {
  [STORAGE_BUCKETS.shopLogos]: 2 * 1024 * 1024,
  [STORAGE_BUCKETS.productImages]: 5 * 1024 * 1024,
  [STORAGE_BUCKETS.expenseReceipts]: 10 * 1024 * 1024,
};

function extensionFor(file: File) {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : "";
  const safe = (fromName ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return safe || "jpg";
}

/** Uploads an image and returns its storage path (not a URL). */
export async function uploadImage(
  bucket: StorageBucket,
  shopId: string,
  file: File,
): Promise<string> {
  const limit = MAX_BYTES[bucket] ?? 5 * 1024 * 1024;
  if (file.size > limit) {
    throw new Error(
      `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is ${limit / 1024 / 1024} MB.`,
    );
  }
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file.");
  }

  const path = `${shopId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(file)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}

/** Short-lived, permission-checked URL for a stored object path. */
export async function signedUrl(
  bucket: StorageBucket,
  path: string,
  expiresInSeconds = 60 * 60,
): Promise<string | null> {
  if (!path) return null;
  // Anything that already looks like an absolute URL is passed through, so old
  // rows written before paths were used keep working.
  if (/^https?:\/\//i.test(path)) return path;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function signedUrls(
  bucket: StorageBucket,
  paths: string[],
  expiresInSeconds = 60 * 60,
): Promise<Record<string, string>> {
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrls(unique, expiresInSeconds);
  if (error) return {};

  return (data ?? []).reduce<Record<string, string>>((acc, entry) => {
    if (entry.path && entry.signedUrl) acc[entry.path] = entry.signedUrl;
    return acc;
  }, {});
}

export async function removeObject(bucket: StorageBucket, path: string): Promise<void> {
  if (!path || /^https?:\/\//i.test(path)) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw error;
}

/** Objects removed per `remove` call — the API caps a single request at 100. */
const REMOVE_BATCH = 100;

/**
 * Every object under a shop's prefix, in every bucket this app owns.
 *
 * Used after a shop is deleted. Deleting the `shops` row does not delete files:
 * storage has no foreign keys, so without this the shop's logo, product photos
 * and expense receipts would sit in the buckets forever. They would be
 * unreachable — the policies derive tenancy from the first path segment, so with
 * no shop row there is no membership to authorise — but unreachable is not the
 * same as gone.
 *
 * Every bucket in `STORAGE_BUCKETS` is walked, because a shop's files are spread
 * across all three and a caller should not have to know which.
 */
export async function removeShopFiles(shopId: string): Promise<number> {
  let removed = 0;
  for (const bucket of Object.values(STORAGE_BUCKETS)) {
    // One folder per shop, and files are keyed flat inside it, so a single level
    // of listing is enough — `id === null` is Supabase's marker for a folder.
    const { data, error } = await supabase.storage.from(bucket).list(shopId, { limit: 1000 });
    if (error) throw error;
    const paths = (data ?? [])
      .filter((entry) => entry.id !== null)
      .map((entry) => `${shopId}/${entry.name}`);
    if (paths.length === 0) continue;

    for (let at = 0; at < paths.length; at += REMOVE_BATCH) {
      const batch = paths.slice(at, at + REMOVE_BATCH);
      const { error: removeError } = await supabase.storage.from(bucket).remove(batch);
      if (removeError) throw removeError;
      removed += batch.length;
    }
  }
  return removed;
}
