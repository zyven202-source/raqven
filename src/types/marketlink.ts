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
  status: MarketOrderState;
  customer_confirmed_at?: string | null;
  seller_confirmed_at?: string | null;
  settled_at?: string | null;
  dispute_reason?: string | null;
  sale_id?: string | null;
  review?: { id: string; rating: number; body: string | null; created_at: string } | null;
  shop_slug: string;
  shop_name: string;
  subtotal: number;
  delivery_fee: number | null;
  currency: string;
  fulfillment: string;
  created_at: string;
  items: { name: string; quantity: number; unit_price: number; line_total: number; unit: string }[];
}

/**
 * The whole order lifecycle.
 *
 * The generated database types only know the values that existed when they
 * were last generated; the migration adds the rest. Keeping the wider union
 * here means the UI can be written against the finished state machine without
 * editing generated files by hand.
 */
export type MarketOrderState =
  | MarketlinkOrderStatus
  | "preparing"
  | "ready_for_collection"
  | "out_for_delivery"
  | "awaiting_settlement"
  | "settled"
  | "disputed";

export const MARKETLINK_STATUS_LABEL: Record<MarketOrderState, string> = {
  pending: "Pending review",
  accepted: "Accepted",
  preparing: "Preparing",
  ready_for_collection: "Ready for collection",
  out_for_delivery: "Out for delivery",
  awaiting_settlement: "Awaiting completion",
  settled: "Settled",
  disputed: "Disputed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  completed: "Completed",
};

/** Only a settled order may be reviewed, printed as a receipt or refunded. */
export function isSettled(status: MarketOrderState): boolean {
  return status === "settled" || status === "completed";
}

export interface InboxNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  target_path: string;
  shop_slug: string;
  shop_name: string;
  order_reference: string | null;
  audience: "personal" | "shop";
}

export interface InboxCounts {
  notifications: number;
  releases: number;
}

export interface MarketRelease {
  id: string;
  version: string;
  title: string;
  summary: string | null;
  highlights: string[];
  fixes: string[];
  notes_path: string | null;
  published_at: string;
  read: boolean;
}

export interface SettlementState {
  status: MarketOrderState;
  settled_at: string | null;
  customer_confirmed_at: string | null;
  seller_confirmed_at: string | null;
  sale_id: string | null;
  duplicate: boolean;
}

export interface ListCandidate {
  listing_id: string;
  product_id: string;
  name: string;
  unit: string;
  price: number;
  currency: string;
  image_path: string | null;
  shop_slug: string;
  shop_name: string;
  stock_state: StockState;
  max_quantity: number;
  delivery_kinds: MarketlinkDeliveryKind[];
  is_requested: boolean;
  in_stock: boolean;
}

export interface MarketListItem {
  id: string;
  name: string;
  quantity: number;
  note: string | null;
  resolved: boolean;
  listing_id: string | null;
  candidates: ListCandidate[];
}

export interface MarketListPayload {
  id: string;
  name: string;
  is_owner: boolean;
  share_token: string | null;
  updated_at: string;
  items: MarketListItem[];
}

export interface MarketListSummary {
  id: string;
  name: string;
  share_token: string;
  share_enabled: boolean;
  updated_at: string;
  item_count: number;
  open_count: number;
}

export interface ShopReputation {
  average: number;
  count: number;
  verified_count: number;
  five_star: number;
}

export interface ShopReview {
  id: string;
  rating: number;
  body: string | null;
  created_at: string;
  verified_purchase: boolean;
  author: string;
}

export interface OrderDocument {
  document: string;
  status: MarketOrderState;
  reference: string;
  created_at: string;
  settled_at: string | null;
  customer_confirmed_at: string | null;
  seller_confirmed_at: string | null;
  dispute_reason: string | null;
  fulfillment: "pickup" | "delivery";
  delivery_fee: number | null;
  subtotal: number;
  total: number;
  currency: string;
  customer_name: string;
  destination: {
    address: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
  };
  shop: {
    name: string;
    slug: string;
    phone: string | null;
    email: string | null;
    location: string | null;
    header_text: string | null;
    footer_text: string | null;
    show_logo: boolean;
    logo_url: string | null;
    paper_width_mm: number;
  };
  items: {
    name: string;
    quantity: number;
    unit: string | null;
    unit_price: number;
    line_total: number;
    image_path: string | null;
  }[];
  payment: {
    sale_id: string;
    receipt_number: string;
    amount_paid: number;
    balance_due: number;
    methods: { method: string; amount: number }[];
  } | null;
  history: { from: MarketOrderState | null; to: MarketOrderState | null; at: string; by: string }[];
}

export const DELIVERY_KIND_LABEL: Record<MarketlinkDeliveryKind, string> = {
  local: "Local delivery",
  nationwide: "Nationwide delivery",
  worldwide: "Worldwide delivery",
};
