import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { LoadingState } from "@/components/app/AppChrome";
import { useSession } from "@/hooks/useSession";
import { useMyShops } from "@/hooks/useShops";
import { loadShopSnapshot, saveShopSnapshot } from "@/lib/offline/shopCache";
import type { ShopRole, ShopWithRole } from "@/types/savo";

const ACTIVE_SHOP_KEY = "savo.activeShopId";
/** The key the pre-rebrand build wrote; adopted once so the last-opened shop survives the rename. */
const LEGACY_ACTIVE_SHOP_KEY = "ravqen.activeShopId";

function readStoredShopId(): string | null {
  try {
    const stored = window.localStorage.getItem(ACTIVE_SHOP_KEY);
    if (stored) return stored;
    const legacy = window.localStorage.getItem(LEGACY_ACTIVE_SHOP_KEY);
    if (legacy) {
      window.localStorage.setItem(ACTIVE_SHOP_KEY, legacy);
      window.localStorage.removeItem(LEGACY_ACTIVE_SHOP_KEY);
    }
    return legacy;
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

  /*
   * Offline fallback: the last membership list this device actually received.
   * Loaded at mount rather than only after the live query *fails*: React Query
   * retries with backoff, so a cold start with no network would otherwise sit
   * on "Opening your shop…" for several seconds before the error ever lands.
   * The server remains the authority — `shops` below always prefers live data,
   * and the snapshot is replaced wholesale on the first successful fetch.
   */
  const [offlineShops, setOfflineShops] = useState<ShopWithRole[] | null>(null);
  const snapshotRequested = useRef(false);

  useEffect(() => {
    if (shopsQuery.data) {
      void saveShopSnapshot(shopsQuery.data).catch(() => {
        /* Best effort: a snapshot that cannot be written costs a cold offline
           start, never a sale. */
      });
      setOfflineShops(null); // live data wins
      return;
    }
    if (snapshotRequested.current || offlineShops !== null) return;
    snapshotRequested.current = true;
    void loadShopSnapshot()
      .then((rows) => setOfflineShops((current) => current ?? (rows.length > 0 ? rows : [])))
      .catch(() => setOfflineShops((current) => current ?? []));
  }, [shopsQuery.data, offlineShops]);

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

  const shops = useMemo(
    () => shopsQuery.data ?? offlineShops ?? [],
    [shopsQuery.data, offlineShops],
  );

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
    // With no live answer, the snapshot can still resolve the selection — but
    // only when there is one to resolve. An empty or absent snapshot must NOT
    // run this logic, or it would clear a perfectly good stored selection
    // before the server ever had a chance to answer.
    if (!shopsQuery.isSuccess && (!offlineShops || offlineShops.length === 0)) return;
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
  }, [shopsQuery.isSuccess, selectedId, activeShop, shops, offlineShops]);

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
      loading: sessionLoading || (shopsQuery.isPending && shops.length === 0),
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
