import { supabase } from "@/integrations/supabase/client";
import type { Profile, ProfileInput } from "@/types/savo";

export async function getMyProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateMyProfile(patch: ProfileInput): Promise<Profile> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Not signed in.");

  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", auth.user.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}
