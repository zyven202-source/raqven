/**
 * Marketlink view models.
 *
 * The public shapes below are deliberately separate from the database rows:
 * anonymous visitors never read a table, they receive a hand-built JSON object
 * from a SECURITY DEFINER function. Typing the result here is what stops a
 * component from reaching for a column (a cost price, a customer's phone) that
 * the public payload does not contain.
 */
import type { MarketlinkDeliveryKind, MarketlinkOrderStatus } from "@/types/savo";

export type StockState = "in" | "low" | "out";

/**
 * How the shared feed is ordered. `relevance` is the default: buyable first,
 * then nearest when a location is known, then newest. `newest` is the seller's
 * own publication time. `nearby` only reorders shops that published a location.
 */
export type MarketFeedSort = "relevance" | "newest" | "nearby";

/** One product in the public marketplace feed. */
export interface MarketFeedItem {
  id: string;
  product_id: string;
  shop_slug: string;
  shop_name: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  unit: string;
  image_path: string;
  category: string | null;
  stock_state: StockState;
  max_quantity: number;
  /** Kilometres, only when the seller published coordinates and we had ours. */
  distance_km: number | null;
  delivery_kinds: MarketlinkDeliveryKind[];
}

export interface MarketFeedResult {
  items: MarketFeedItem[];
  has_more: boolean;
  returned: number;
}

export interface MarketCategory {
  name: string;
  count: number;
}

export interface PublicShop {
  slug: string;
  name: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  currency: string;
}

export interface PublicDeliveryZone {
  id: string;
  kind: MarketlinkDeliveryKind;
  country: string | null;
  region: string | null;
  city: string | null;
  /** NULL means the seller confirms the cost — never a made-up number. */
  fee: number | null;
  note: string | null;
}

export interface PublicShopPayload {
  shop: PublicShop;
  delivery: PublicDeliveryZone[];
  products: MarketFeedItem[];
}

export interface PublicProductPayload {
  listing: MarketFeedItem;
  shop: PublicShop;
  delivery: PublicDeliveryZone[];
  related: MarketFeedItem[];
}

export interface SubmitOrderLine {
  product_id: string;
  quantity: number;
}

export interface SubmitOrderInput {
  slug: string;
  clientToken: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  preferredContact: "phone" | "email" | "whatsapp";
  fulfillment: "pickup" | "delivery";
  deliveryZoneId?: string | null;
  destinationCountry?: string | null;
  destinationRegion?: string | null;
  destinationCity?: string | null;
  deliveryAddress?: string | null;
  note?: string | null;
  items: SubmitOrderLine[];
}

export interface SubmitOrderResult {
  order_id: string;
  reference: string;
  status: MarketlinkOrderStatus;
  subtotal: number;
  delivery_fee: number | null;
  currency: string;
  shop_name: string;
  duplicate: boolean;
}

export interface CustomerOrder {
  id: string;
  reference: string;
  status: MarketlinkOrderStatus;
  shop_slug: string;
  shop_name: string;
  subtotal: number;
  delivery_fee: number | null;
  currency: string;
  fulfillment: string;
  created_at: string;
  items: { name: string; quantity: number; unit_price: number; line_total: number; unit: string }[];
}

export const MARKETLINK_STATUS_LABEL: Record<MarketlinkOrderStatus, string> = {
  pending: "Pending review",
  accepted: "Accepted",
  rejected: "Rejected",
  cancelled: "Cancelled",
  completed: "Completed",
};

export const DELIVERY_KIND_LABEL: Record<MarketlinkDeliveryKind, string> = {
  local: "Local delivery",
  nationwide: "Nationwide delivery",
  worldwide: "Worldwide delivery",
};
