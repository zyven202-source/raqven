/**
 * Shop data access. All calls go through the Supabase client and are bound by
 * row level security — a user only ever sees shops they belong to.
 */
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/format";
import type { Shop, ShopUpdate, ShopWithRole } from "@/types/ravqen";

export async function listMyShops(): Promise<ShopWithRole[]> {
  const { data, error } = await supabase
    .from("shop_members")
    .select("role, shops:shop_id (*)")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? [])
    .filter((row) => row.shops)
    .map((row) => ({ ...(row.shops as Shop), role: row.role }));
}

export async function getShop(shopId: string): Promise<Shop | null> {
  const { data, error } = await supabase.from("shops").select("*").eq("id", shopId).maybeSingle();
  if (error) throw error;
  return data;
}

export interface CreateShopInput {
  name: string;
  businessType?: string | null;
  phone?: string | null;
  city?: string | null;
  currency?: string;
}

/** Creates a shop owned by the signed-in user. A trigger enrolls them as owner. */
export async function createShop(input: CreateShopInput): Promise<Shop> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!auth.user) throw new Error("You must be signed in to create a shop.");

  const baseSlug = slugify(input.name);
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`.slice(0, 60);

  const { data, error } = await supabase
    .from("shops")
    .insert({
      owner_id: auth.user.id,
      name: input.name.trim(),
      slug,
      business_type: input.businessType ?? null,
      phone: input.phone ?? null,
      city: input.city ?? null,
      currency: input.currency ?? "KES",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateShop(shopId: string, patch: ShopUpdate): Promise<Shop> {
  const { data, error } = await supabase
    .from("shops")
    .update(patch)
    .eq("id", shopId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
