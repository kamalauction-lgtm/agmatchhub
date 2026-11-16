/**
 * Listing display formatters, shared by the inventory list and the
 * co-marketing pool.
 *
 * Extracted from the listings page when the pool screen needed the same two —
 * the alternative was a second copy that would drift the first time a currency
 * or a rent period changed.
 */

/**
 * `IDR 3.200.000.000` or `IDR 25.000.000/bln` — rupiah keep their Indonesian
 * grouping exactly as before. Any other currency (P1-a) uses its own
 * convention: `RM 880,000` or `RM 4,500/mo`, never `MYR 880.000`.
 */
export function money(currency: string, price: number, rentPeriod: string | null) {
  if (currency === "IDR") {
    const suffix = rentPeriod ? (rentPeriod === "monthly" ? "/bln" : "/thn") : "";
    return `${currency} ${Number(price).toLocaleString("id-ID")}${suffix}`;
  }
  const suffix = rentPeriod ? (rentPeriod === "monthly" ? "/mo" : "/yr") : "";
  let text: string;
  try {
    text = new Intl.NumberFormat(currency === "MYR" ? "en-MY" : "en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(price));
  } catch {
    text = `${currency} ${Number(price).toLocaleString("en-US")}`;
  }
  return `${text}${suffix}`;
}

/** `Jakarta Selatan, DKI Jakarta`. Falls back to an em dash, never blank. */
export function place(
  p: { regency_name: string | null; province_name: string | null } | null
) {
  return [p?.regency_name, p?.province_name].filter(Boolean).join(", ") || "—";
}
