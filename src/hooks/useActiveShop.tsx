import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
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

  // Keep the selection honest. Two cases matter: the stored id no longer
  // matches any membership (a shop was left or removed), and the user has no
  // stored id at all — a staff member who has just redeemed an access code, or
  // a brand new account. Without the second case they would sit on
  // "Select a shop to continue…" forever with a membership already in hand.
  useEffect(() => {
    if (!shopsQuery.isSuccess) return;
    if (activeShop) return;
    if (selectedId && !shops.some((shop) => shop.id === selectedId)) {
      // The stored shop is gone; fall back to whatever they still belong to.
    } else if (selectedId === null && shops.length > 0) {
      // No selection yet and memberships exist: take the first one.
    } else {
      return;
    }

    const fallback = shops[0]?.id ?? null;
    setSelectedId(fallback);
    try {
      if (fallback) window.localStorage.setItem(ACTIVE_SHOP_KEY, fallback);
      else window.localStorage.removeItem(ACTIVE_SHOP_KEY);
    } catch {
      /* non-fatal */
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
  const { activeShop, loading, hasNoShops } = useActiveShop();
  const navigate = useNavigate();

  // With no shop at all there is nothing to select, so "select a shop" would be
  // a dead end. Send the person to the hub, which can actually resolve it.
  useEffect(() => {
    if (!loading && !activeShop && hasNoShops) {
      void navigate({ to: "/dashboard", replace: true });
    }
  }, [loading, activeShop, hasNoShops, navigate]);

  if (loading) return <LoadingState label="Opening your shop…" />;
  if (!activeShop) return <LoadingState label="Opening your shop…" />;
  return <>{children}</>;
}
