import type { PublicDeliveryZone } from "@/types/marketlink";
import type { MarketlinkDeliveryKind } from "@/types/savo";

/** The same comparison the database makes, so the customer sees the same answer. */
export function zoneMatches(
  zone: PublicDeliveryZone,
  country: string,
  region: string,
  city: string,
): boolean {
  const norm = (value: string) => value.trim().toLowerCase();
  if (zone.kind === "worldwide") return true;
  if (zone.kind === "nationwide") {
    return Boolean(zone.country) && norm(zone.country ?? "") === norm(country);
  }
  if (zone.country && norm(zone.country) !== norm(country)) return false;
  if (zone.region && norm(zone.region) !== norm(region)) return false;
  if (zone.city && norm(zone.city) !== norm(city)) return false;
  return Boolean(zone.region || zone.city);
}

export function zoneLabel(zone: PublicDeliveryZone): string {
  if (zone.kind === "worldwide") {
    return zone.note ? `Worldwide — ${zone.note}` : "Worldwide delivery";
  }
  const place = [zone.city, zone.region, zone.country].filter(Boolean).join(", ");
  if (zone.kind === "nationwide") {
    return `Nationwide — ${zone.country}${zone.note ? ` · ${zone.note}` : ""}`;
  }
  return `Local delivery — ${place}${zone.note ? ` · ${zone.note}` : ""}`;
}

export function feeLabel(fee: number | null, currency: string): string {
  if (fee === null) return "Delivery cost confirmed by the shop";
  return `${currency} ${fee.toFixed(2)} delivery`;
}

export function distanceLabel(km: number | null): string | null {
  if (km === null || !Number.isFinite(km)) return null;
  if (km < 1) return "Under 1 km away";
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
}

export function stockLabel(state: "in" | "low" | "out"): string {
  if (state === "out") return "Out of stock";
  if (state === "low") return "Low stock";
  return "In stock";
}

export const DELIVERY_SHORT: Record<MarketlinkDeliveryKind, string> = {
  local: "Local",
  nationwide: "Nationwide",
  worldwide: "Worldwide",
};
