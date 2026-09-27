/** Formatting helpers shared across RAVQEN. Default locale is Kenya. */

export function formatMoney(amount: number | string | null | undefined, currency = "KES") {
  const value = typeof amount === "string" ? Number(amount) : (amount ?? 0);
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium" }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/** Turns a shop name into a URL-safe slug matching the database constraint. */
export function slugify(input: string) {
  const base = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52);
  return base.length >= 3 ? base : `shop-${base}`.slice(0, 60);
}
