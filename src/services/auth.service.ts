import { supabase } from "@/integrations/supabase/client";

export async function signUpWithEmail(params: {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}) {
  const { error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      emailRedirectTo: `${window.location.origin}/dashboard`,
      data: { full_name: params.fullName, phone: params.phone ?? null },
    },
  });
  if (error) throw error;
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
