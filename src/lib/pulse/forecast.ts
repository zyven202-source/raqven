/**
 * Pith Pulse — the restock radar.
 *
 * A deliberately plain, explainable baseline. There is no machine learning
 * here and the screen never claims any: the estimate is the recorded units
 * sold over a fixed observation window divided by the days actually observed,
 * with every assumption written down next to the number.
 *
 * The rules, in full:
 *
 *   Observation window   The 14 calendar days ending now, shortened to the
 *                        shop's recorded history when the shop is younger.
 *   Missing dates        Counted as zero-demand days. A day with no recorded
 *                        sale is a day the shop recorded no sale — that is
 *                        information, not missing data. Confidence falls when
 *                        the shop has traded on few days of the window.
 *   Avg daily demand     Units sold ÷ observed days. Null when no units were
 *                        sold — never zero, never a guess.
 *   Days remaining       Stock ÷ daily demand, rounded up. Null when demand
 *                        is zero or the window is too thin to divide by.
 *   Suggested quantity   Enough to cover `COVER_DAYS` of demand on top of what
 *                        is on the shelf, floored at the product's own
 *                        configured reorder threshold. No supplier lead time
 *                        is invented: none is configured in Pith, so none is
 *                        assumed. The cover target is a stated constant and
 *                        the screen says so.
 *   Never automatic      Nothing here writes stock. The action opens the
 *                        existing receive-stock screen for review.
 */
import type { Confidence, ForecastBucket, ForecastRow } from "@/lib/pulse/types";

/** Days of demand a suggested order should cover. Stated in the UI, not hidden. */
export const COVER_DAYS = 14;

/** An observation window shorter than this cannot support a demand estimate. */
const MIN_OBSERVED_DAYS = 4;

/** A window where the shop recorded sales on fewer days than this is thin. */
const MIN_ACTIVE_DAYS_FOR_HIGH_CONFIDENCE = 6;

export interface ForecastProduct {
  id: string;
  name: string;
  unit: string;
  stock: number;
  threshold: number;
  /** When the product was created — bounds its observable history. */
  createdAt: string;
}

export interface ForecastInput {
  products: ForecastProduct[];
  /** Every sale line inside the observation window (all products together). */
  windowLines: { productId: string | null; quantity: number; soldAt: string }[];
  now: Date;
  /** Distinct local days inside the window on which the shop sold anything. */
  activeDays: number;
  /** Earliest recorded sale of the shop; null when it has no sales at all. */
  firstSaleAt: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Computes the radar. Every active product gets a row so the screen can show
 * "stock appears sufficient" honestly rather than omitting what it did not
 * flag; products with nothing to say still carry their reasons.
 */
export function buildForecasts(input: ForecastInput): ForecastRow[] {
  const now = input.now;
  const windowEnd = now.getTime();
  const windowStart = windowEnd - 14 * DAY_MS;
  // A shop younger than the full window can only be judged on the days it has
  // existed; a product created mid-window likewise.
  const shopHistoryStart = input.firstSaleAt ? new Date(input.firstSaleAt).getTime() : null;

  const unitsByProduct = new Map<string, { units: number; days: Set<string> }>();
  for (const line of input.windowLines) {
    if (!line.productId) continue;
    const at = new Date(line.soldAt).getTime();
    if (at > windowEnd) continue;
    const entry = unitsByProduct.get(line.productId) ?? { units: 0, days: new Set<string>() };
    entry.units += line.quantity;
    entry.days.add(dayKey(new Date(line.soldAt)));
    unitsByProduct.set(line.productId, entry);
  }

  return input.products.map((product) => {
    const created = new Date(product.createdAt).getTime();
    // The denominator: whole calendar days from the later of (window start,
    // product creation, shop's first recorded sale) to now, minimum one.
    const historyStart = Math.max(windowStart, created, shopHistoryStart ?? windowStart);
    const observedDays = Math.max(1, Math.ceil((windowEnd - historyStart) / DAY_MS));

    const sold = unitsByProduct.get(product.id) ?? { units: 0, days: new Set<string>() };
    const avgDailyDemand = observedDays > 0 && sold.units > 0 ? sold.units / observedDays : null;
    const daysRemaining =
      avgDailyDemand !== null && avgDailyDemand > 0
        ? Math.ceil(product.stock / avgDailyDemand)
        : null;

    const confidence = classifyConfidence({
      units: sold.units,
      productSaleDays: sold.days.size,
      observedDays,
      activeDays: input.activeDays,
    });

    /*
      The suggestion, as one sentence: cover `COVER_DAYS` of estimated demand
      on top of what is already on the shelf, never below the product's own
      configured threshold — and when that works out at nothing, there is
      nothing to suggest, so it is null rather than a pointless zero.
    */
    const coverSuggestion =
      avgDailyDemand !== null && confidence !== "insufficient"
        ? Math.ceil(avgDailyDemand * COVER_DAYS - product.stock)
        : 0;
    const thresholdFloor =
      product.stock <= product.threshold ? Math.ceil(product.threshold - product.stock) + 1 : 0;
    const suggested = Math.max(0, coverSuggestion, thresholdFloor);
    const suggestQty = suggested > 0 ? suggested : null;

    const { bucket, reasons } = classify({
      stock: product.stock,
      threshold: product.threshold,
      avgDailyDemand,
      daysRemaining,
      unitsSold: sold.units,
      confidence,
    });

    return {
      productId: product.id,
      name: product.name,
      unit: product.unit,
      stock: product.stock,
      threshold: product.threshold,
      unitsSold: sold.units,
      avgDailyDemand,
      daysRemaining,
      suggestQty,
      bucket,
      confidence,
      reasons,
      observedDays,
      activeDays: input.activeDays,
    };
  });
}

function classifyConfidence(input: {
  units: number;
  productSaleDays: number;
  observedDays: number;
  activeDays: number;
}): Confidence {
  if (input.units <= 0) return "insufficient";
  if (input.observedDays < MIN_OBSERVED_DAYS || input.activeDays < 3) return "insufficient";
  if (input.productSaleDays >= 6 && input.activeDays >= MIN_ACTIVE_DAYS_FOR_HIGH_CONFIDENCE)
    return "high";
  if (input.productSaleDays >= 3) return "moderate";
  return "low";
}

function classify(input: {
  stock: number;
  threshold: number;
  avgDailyDemand: number | null;
  daysRemaining: number | null;
  unitsSold: number;
  confidence: Confidence;
}): { bucket: ForecastBucket; reasons: string[] } {
  const reasons: string[] = [];
  const { stock, threshold, avgDailyDemand, daysRemaining, unitsSold, confidence } = input;

  if (unitsSold > 0 && avgDailyDemand !== null) {
    reasons.push(
      `Sold ${trim(unitsSold)} over the observed window — about ${trim(avgDailyDemand)} per day.`,
    );
  } else {
    reasons.push("No sales recorded in the observation window.");
  }
  reasons.push(`On the shelf: ${trim(stock)} · Reorder threshold: ${trim(threshold)}.`);

  if (confidence === "insufficient") {
    reasons.push("Not enough sales history to estimate how fast this sells.");
    if (stock <= threshold) {
      return { bucket: "soon", reasons };
    }
    return { bucket: "insufficient", reasons };
  }

  if (daysRemaining !== null) {
    reasons.push(
      `At the recent rate, about ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} of stock left.`,
    );
  }

  if (stock <= threshold) {
    reasons.push("At or below its reorder threshold.");
    if (daysRemaining !== null && daysRemaining <= 3) return { bucket: "urgent", reasons };
    return { bucket: "soon", reasons };
  }

  if (daysRemaining !== null && daysRemaining <= 3) {
    reasons.push("Fewer than three days of stock left at the recent rate.");
    return { bucket: "urgent", reasons };
  }
  if (daysRemaining !== null && daysRemaining <= 7) {
    return { bucket: "soon", reasons };
  }
  return { bucket: "sufficient", reasons };
}

/** Trims a float to at most two decimals without trailing zeroes. */
function trim(value: number): string {
  return String(Math.round(value * 100) / 100);
}
