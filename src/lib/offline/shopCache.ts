/**
 * The workspace snapshot.
 *
 * An offline start has to answer one question before anything else can work:
 * *which shop was this device last operating in, and what is the user's role
 * in it?* Without it, a cold offline launch lands on "You are not in a shop
 * yet" — and the offline till is unreachable.
 *
 * This is membership metadata, not business data: it is a mirror of rows the
 * server already gave this user, used only to rebuild the shell. It is never
 * the authority — every read and write still goes through RLS the moment the
 * network answers, and a membership revoked while offline simply stops
 * resolving on the first successful fetch.
 */
import { getMeta, setMeta } from "@/lib/offline/db";
import type { ShopWithRole } from "@/types/savo";

const SHOPS_KEY = "workspace:shops";

export async function saveShopSnapshot(shops: ShopWithRole[]): Promise<void> {
  if (shops.length === 0) return; // never overwrite a good snapshot with nothing
  await setMeta(SHOPS_KEY, shops);
}

export async function loadShopSnapshot(): Promise<ShopWithRole[]> {
  const rows = await getMeta<ShopWithRole[]>(SHOPS_KEY);
  return Array.isArray(rows) ? rows : [];
}
