import { Outlet, createFileRoute } from "@tanstack/react-router";

/**
 * Layout for the public shop.
 *
 * The storefront itself is the index child, and the product page is a sibling
 * child. Both render their own `MarketShell`, so this layout only provides the
 * outlet they mount into. Without it, `/shop/$slug/p/$listingId` matched but
 * could never render.
 */
export const Route = createFileRoute("/shop/$slug")({
  component: () => <Outlet />,
});
