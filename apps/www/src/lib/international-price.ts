/**
 * The three-figure price for an international listing. Pure and
 * dependency-free so it can be unit-tested outside Next.
 *
 * Owner's rule (21 Nov 2026): rupiah first and most prominent, then the
 * listing's OWN currency — the only real price — then US dollars. The rupiah
 * and dollar figures are estimates derived from `public_fx_rates.per_usd`
 * (units of a currency per one US dollar) and are always flagged as such.
 *
 *   · own currency is the lead currency      → lead + reference
 *   · own currency is the reference currency → lead + reference
 *   · anything else                          → lead + own + reference
 *
 * A figure whose rate is missing is LEFT OUT. This never returns a number it
 * could not compute: a missing rate shortens the block, it does not guess.
 *
 * The two currencies are named here, once, because they are the owner's
 * decision about this section and not the market's currency: a Malaysian
 * build must not start showing ringgit against a project in Dubai.
 */

export const LEAD_CURRENCY = "IDR";
export const REFERENCE_CURRENCY = "USD";

export type FxRate = { per_usd: number; as_of: string };
/** Keyed by ISO 4217 code. */
export type FxRates = Record<string, FxRate>;

export type PriceFigure = {
  currency: string;
  min: number;
  /** Null when the listing states a single price rather than a range. */
  max: number | null;
  /** True for a converted figure; false for the listing's own currency. */
  estimate: boolean;
};

export type PriceBlock = {
  /** In display order. Empty when the listing states no price at all. */
  figures: PriceFigure[];
  /** Date of the OLDEST rate used by any estimate; null with no estimates. */
  asOf: string | null;
};

function perUsd(currency: string, rates: FxRates): number | null {
  if (currency === REFERENCE_CURRENCY) return 1;
  const rate = rates[currency]?.per_usd;
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
}

/** Convert through the US dollar. Null when either rate is unknown. */
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: FxRates
): number | null {
  if (!Number.isFinite(amount)) return null;
  if (from === to) return amount;
  const source = perUsd(from, rates);
  const target = perUsd(to, rates);
  if (source === null || target === null) return null;
  return (amount / source) * target;
}

export function priceFigures(
  currency: string,
  priceMin: number | null,
  priceMax: number | null,
  rates: FxRates
): PriceBlock {
  const low = priceMin ?? priceMax;
  if (low === null || low === undefined || !Number.isFinite(low)) {
    return { figures: [], asOf: null };
  }
  const high = priceMax !== null && priceMin !== null && priceMax > priceMin ? priceMax : null;

  const figures: PriceFigure[] = [];
  const datesUsed: string[] = [];

  for (const target of new Set([LEAD_CURRENCY, currency, REFERENCE_CURRENCY])) {
    if (target === currency) {
      figures.push({ currency, min: low, max: high, estimate: false });
      continue;
    }
    const min = convertCurrency(low, currency, target, rates);
    const max = high === null ? null : convertCurrency(high, currency, target, rates);
    if (min === null || (high !== null && max === null)) continue;

    figures.push({ currency: target, min: Math.round(min), max: max === null ? null : Math.round(max), estimate: true });
    for (const used of [currency, target]) {
      const date = rates[used]?.as_of;
      if (used !== REFERENCE_CURRENCY && date) datesUsed.push(date);
    }
  }

  // ISO dates sort as text. The oldest is the honest one to print.
  const asOf = datesUsed.length ? [...datesUsed].sort()[0] : null;
  return { figures, asOf };
}

/** Sort key for "price low to high": the starting price in US dollars. */
export function usdEquivalent(
  currency: string,
  priceMin: number | null,
  priceMax: number | null,
  rates: FxRates
): number | null {
  const low = priceMin ?? priceMax;
  if (low === null || low === undefined) return null;
  return convertCurrency(low, currency, REFERENCE_CURRENCY, rates);
}
