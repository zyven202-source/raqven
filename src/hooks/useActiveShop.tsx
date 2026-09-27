import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { LoadingState } from "@/components/app/AppChrome";
import { useSession } from "@/hooks/useSession";
import { useMyShops } from "@/hooks/useShops";
import type { ShopRole, ShopWithRole } from "@/types/ravqen";

const ACTIVE_SHOP_KEY = "ravqen.activeShopId";

function readStoredShopId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_SHOP_KEY);
  } catch {
    return null;
  }
}

/**
 * Active-shop context for the signed-in workspace.
 *
 * Note on localStorage: this is *UI selection memory only* (which shop the tab
 * had open last), never a data store. All business data is fetched live from
 * Supabase under RLS.
 */
interface ActiveShopContextValue {
  shops: ShopWithRole[];
  /** The shop the workspace is operating on, or null when none is selected. */
  activeShop: ShopWithRole | null;
  /** The signed-in user's role in the active shop. */
  role: ShopRole | null;
  isOwner: boolean;
  /** Loading state while memberships and profile resolve. */
  loading: boolean;
  /** True when the signed-in user has no active membership in any shop. */
  hasNoShops: boolean;
  selectShop: (shopId: string) => void;
}

const ActiveShopContext = createContext<ActiveShopContextValue | null>(null);

export function ActiveShopProvider({ children }: { children: ReactNode }) {
  const { session, loading: sessionLoading } = useSession();
  const shopsQuery = useMyShops();
  const [selectedId, setSelectedId] = useState<string | null>(() => readStoredShopId());

  // Reset the selection when the user changes (sign-out / sign-in).
  useEffect(() => {
    if (sessionLoading) return;
    if (!session) {
      setSelectedId(null);
      try {
        window.localStorage.removeItem(ACTIVE_SHOP_KEY);
      } catch {
        /* storage unavailable — selection just won't persist */
      }
    }
  }, [session, sessionLoading]);

  const shops = useMemo(() => shopsQuery.data ?? [], [shopsQuery.data]);

  const activeShop = useMemo(
    () => shops.find((shop) => shop.id === selectedId) ?? null,
    [shops, selectedId],
  );

  // Keep the stored id honest: if the membership disappeared, fall back.
  useEffect(() => {
    if (!shopsQuery.isSuccess) return;
    if (selectedId && !activeShop) {
      const fallback = shops[0]?.id ?? null;
      setSelectedId(fallback);
      try {
        if (fallback) window.localStorage.setItem(ACTIVE_SHOP_KEY, fallback);
        else window.localStorage.removeItem(ACTIVE_SHOP_KEY);
      } catch {
        /* non-fatal */
      }
    }
  }, [shopsQuery.isSuccess, selectedId, activeShop, shops]);

  const selectShop = useCallback((shopId: string) => {
    setSelectedId(shopId);
    try {
      window.localStorage.setItem(ACTIVE_SHOP_KEY, shopId);
    } catch {
      /* non-fatal */
    }
  }, []);

  const value = useMemo<ActiveShopContextValue>(
    () => ({
      shops,
      activeShop,
      role: activeShop?.role ?? null,
      isOwner: activeShop?.role === "owner",
      loading: sessionLoading || shopsQuery.isPending,
      hasNoShops: shopsQuery.isSuccess && shops.length === 0,
      selectShop,
    }),
    [shops, activeShop, sessionLoading, shopsQuery.isPending, shopsQuery.isSuccess, selectShop],
  );

  return <ActiveShopContext.Provider value={value}>{children}</ActiveShopContext.Provider>;
}

export function useActiveShop(): ActiveShopContextValue {
  const context = useContext(ActiveShopContext);
  if (!context) {
    throw new Error("useActiveShop must be used inside ActiveShopProvider (the /app shell).");
  }
  return context;
}

/** Guard component: blocks the subtree until a shop is selected. */
export function RequireActiveShop({ children }: { children: ReactNode }) {
  const { activeShop, loading } = useActiveShop();
  if (loading) return <LoadingState label="Opening your shop…" />;
  if (!activeShop) return <LoadingState label="Select a shop to continue…" />;
  return <>{children}</>;
}
