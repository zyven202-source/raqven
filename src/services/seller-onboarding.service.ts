/**
 * Open seller onboarding.
 *
 * SAVO Market used to be reachable only through a shop: a shop had to exist
 * before anything could be listed. This is the one-step alternative — an account
 * fills in a stall name and the database opens a personal stall for them, already
 * published, ready for its first product.
 *
 * The stall is a real shop row underneath, so every existing rule (stock,
 * settlement, reviews, RLS) applies unchanged. The database decides the shop id
 * and the public address; nothing here can point a stall at someone else's shop.
 */
import { supabase } from "@/integrations/supabase/client";

export interface SellerStall {
  shopId: string;
  slug: string;
  displayName: string;
  currency: string;
  created: boolean;
}

export interface BecomeSellerInput {
  displayName: string;
  contactPhone?: string | null;
  city?: string | null;
  about?: string | null;
  currency?: string | null;
}

type RpcResult = PromiseLike<{ data: unknown; error: { message: string } | null }>;
const rpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args?: Record<string, unknown>,
) => RpcResult;

async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

interface RawStall {
  shop_id: string;
  slug: string;
  display_name: string;
  currency: string | null;
  created: boolean;
}

export async function becomeSeller(input: BecomeSellerInput): Promise<SellerStall> {
  const raw = await call<RawStall | null>("marketlink_become_seller", {
    p_display_name: input.displayName.trim(),
    p_contact_phone: input.contactPhone?.trim() || null,
    p_city: input.city?.trim() || null,
    p_about: input.about?.trim() || null,
    p_currency: input.currency?.trim() || "KES",
  });
  if (!raw) throw new Error("The stall could not be opened.");
  return {
    shopId: raw.shop_id,
    slug: raw.slug,
    displayName: raw.display_name,
    currency: raw.currency ?? "KES",
    created: Boolean(raw.created),
  };
}

/** The signed-in account's stall, when they have already joined as a seller. */
export async function mySellerStall(): Promise<SellerStall | null> {
  const raw = await call<RawStall | null>("marketlink_my_seller");
  if (!raw) return null;
  return {
    shopId: raw.shop_id,
    slug: raw.slug,
    displayName: raw.display_name,
    currency: raw.currency ?? "KES",
    created: false,
  };
}
