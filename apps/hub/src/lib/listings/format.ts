/**
 * Listing display formatters, shared by the inventory list and the
 * co-marketing pool.
 *
 * Extracted from the listings page when the pool screen needed the same two —
 * the alternative was a second copy that would drift the first time a currency
 * or a rent period changed.
 */

/** `Rp 3.200.000.000` or `Rp 25.000.000/bln`. Indonesian digit grouping. */
export function money(currency: string, price: number, rentPeriod: string | null) {
  const suffix = rentPeriod ? (rentPeriod === "monthly" ? "/bln" : "/thn") : "";
  return `${currency} ${Number(price).toLocaleString("id-ID")}${suffix}`;
}

/** `Jakarta Selatan, DKI Jakarta`. Falls back to an em dash, never blank. */
export function place(
  p: { regency_name: string | null; province_name: string | null } | null
) {
  return [p?.regency_name, p?.province_name].filter(Boolean).join(", ") || "—";
}
