import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { STORAGE_BLOCKED_MESSAGE } from "@/lib/storage";

/**
 * Live Supabase session for the current browser tab.
 *
 * Must always resolve: if the browser blocks storage, `getSession()` rejects,
 * and a hook that only handles success would leave `loading` true forever —
 * which looks like "the app does nothing" after signing in.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError(STORAGE_BLOCKED_MESSAGE);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    let subscription: ReturnType<typeof supabase.auth.onAuthStateChange>["data"] | undefined;
    try {
      subscription = supabase.auth.onAuthStateChange((_event, next) => {
        setSession(next);
        setError(null);
        setLoading(false);
      }).data;
    } catch {
      // The getSession() result above still resolves loading for this render.
    }

    return () => {
      active = false;
      subscription?.subscription.unsubscribe();
    };
  }, []);

  const user: User | null = session?.user ?? null;
  return { session, user, loading, error };
}
