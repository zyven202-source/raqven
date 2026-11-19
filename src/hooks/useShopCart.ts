import { useCallback, useEffect, useMemo, useState } from "react";

import type { MarketFeedItem } from "@/types/marketlink";
import type { CartLine } from "@/components/marketlink/CheckoutDrawer";

const PREFIX = "savo.market.cart.";

function read(slug: string): CartLine[] {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + slug);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (line): line is CartLine =>
        Boolean(line) &&
        typeof line === "object" &&
        typeof (line as CartLine).quantity === "number" &&
        Boolean((line as CartLine).item?.product_id),
    );
  } catch {
    return [];
  }
}

/**
 * A basket scoped to one shop.
 *
 * `sessionStorage`, not the database: a basket is a shopping intention, not an
 * order, and it should disappear when the tab does. Nothing here is trusted at
 * checkout — prices, stock and shop ownership are re-read server-side.
 */
export function useShopCart(slug: string) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLines(read(slug));
    setReady(true);
  }, [slug]);

  useEffect(() => {
    if (!ready) return;
    try {
      if (lines.length === 0) window.sessionStorage.removeItem(PREFIX + slug);
      else window.sessionStorage.setItem(PREFIX + slug, JSON.stringify(lines));
    } catch {
      /* A full or blocked storage just means the basket lasts one page. */
    }
  }, [lines, ready, slug]);

  const add = useCallback((item: MarketFeedItem, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((line) => line.item.product_id === item.product_id);
      const max = Math.max(1, Math.min(item.max_quantity, 99));
      if (existing) {
        return current.map((line) =>
          line.item.product_id === item.product_id
            ? {
                ...line,
                item,
                quantity: Math.min(max, line.quantity + quantity),
              }
            : line,
        );
      }
      return [...current, { item, quantity: Math.max(1, Math.min(max, quantity)) }];
    });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.item.product_id !== productId)
        : current.map((line) =>
            line.item.product_id === productId
              ? {
                  ...line,
                  quantity: Math.max(
                    1,
                    Math.min(quantity, Math.max(1, Math.min(line.item.max_quantity, 99))),
                  ),
                }
              : line,
          ),
    );
  }, []);

  const remove = useCallback((productId: string) => {
    setLines((current) => current.filter((line) => line.item.product_id !== productId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const count = useMemo(() => lines.reduce((sum, line) => sum + line.quantity, 0), [lines]);
  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + Number(line.item.price) * line.quantity, 0),
    [lines],
  );

  return { lines, count, subtotal, add, setQuantity, remove, clear, ready };
}
