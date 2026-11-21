/**
 * The three-figure price of an international listing (owner, 21 Nov 2026).
 *
 * Order is fixed: IDR first (the most prominent), then the listing's own
 * currency (the real price), then USD. IDR and USD are ESTIMATES derived from
 * `fx_rates.per_usd` — "units of a currency that one US dollar buys" — and
 * must be labelled as such together with the date of the rate.
 *
 *   own currency IDR  ->  IDR (real), USD (estimate)
 *   own currency USD  ->  IDR (estimate), USD (real)
 *   anything else     ->  IDR (estimate), own (real), USD (estimate)
 *
 * No other currency is ever shown: a Thai listing never grows a MYR figure.
 * When a rate is missing the figure that needs it is left out rather than
 * guessed; the listing's own price is always shown when it has one.
 *
 * Pure: no I/O, no clock, no translations — so it can be unit-tested directly.
 */
import type { RatesMap } from "./types";

export const PIVOT = "USD";
export const PRIMARY = "IDR";

export type PriceFigure = {
  currency: string;
  min: number | null;
  max: number | null;
  /** True when converted with an exchange rate; false for the listing's own price. */
  estimate: boolean;
};

export type PriceFigures = {
  /** In display order; the first is the most prominent. Never empty. */
  figures: PriceFigure[];
  /** ISO date of the OLDEST rate used, or null when nothing was converted. */
  rateDate: string | null;
};

type Priced = { currency: string; price_min: number | null; price_max: number | null };

function num(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Units of `currency` per one USD. USD itself is 1 even when the table has no row for it. */
function perUsd(currency: string, rates: RatesMap): number | null {
  if (currency === PIVOT) return 1;
  const r = rates[currency]?.perUsd;
  return typeof r === "number" && Number.isFinite(r) && r > 0 ? r : null;
}

/** `amount` of `from` expressed in `to`, through USD. Null when either rate is missing. */
export function convert(amount: number, from: string, to: string, rates: RatesMap): number | null {
  if (from === to) return amount;
  const f = perUsd(from, rates);
  const t = perUsd(to, rates);
  if (f === null || t === null) return null;
  return (amount / f) * t;
}

/**
 * The figures to show for a listing, or null when it has no price at all.
 */
export function priceFigures(listing: Priced, rates: RatesMap): PriceFigures | null {
  const own = listing.currency;
  let min = num(listing.price_min);
  let max = num(listing.price_max);
  if (min === null && max === null) return null;
  // A source that sends the range backwards is still one range.
  if (min !== null && max !== null && min > max) [min, max] = [max, min];

  const used = new Set<string>();
  const figure = (currency: string): PriceFigure | null => {
    if (currency === own) return { currency, min, max, estimate: false };
    const cMin = min === null ? null : convert(min, own, currency, rates);
    const cMax = max === null ? null : convert(max, own, currency, rates);
    if ((min !== null && cMin === null) || (max !== null && cMax === null)) return null;
    for (const c of [own, currency]) if (c !== PIVOT) used.add(c);
    return { currency, min: cMin, max: cMax, estimate: true };
  };

  const order = [PRIMARY, own, PIVOT].filter((c, i, all) => all.indexOf(c) === i);
  const figures = order.map(figure).filter((f): f is PriceFigure => f !== null);

  const dates = [...used].map((c) => rates[c]?.asOf).filter((d): d is string => Boolean(d)).sort();
  return { figures, rateDate: dates[0] ?? null };
}

/* ------------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------------ */

/** BCP 47 tag for number formatting in an interface language. */
export function numberLocale(locale: string): string {
  return locale === "id" ? "id-ID" : locale === "ms" ? "ms-MY" : "en-US";
}

/**
 * One amount. Estimates are rounded the way a person would say them: rupiah
 * in compact notation ("Rp 5,4 M"), anything else to whole units. A real
 * price keeps its full digits — except rupiah from one million up, which
 * follow the same compact form when `compact` is set (cards).
 */
export function formatAmount(
  amount: number,
  currency: string,
  locale: string,
  opts: { estimate?: boolean; compact?: boolean } = {},
): string {
  const tag = numberLocale(locale);
  const compact = (opts.estimate || opts.compact) && currency === PRIMARY && amount >= 1_000_000;
  try {
    return new Intl.NumberFormat(tag, {
      style: "currency",
      currency,
      ...(compact
        ? { notation: "compact" as const, maximumFractionDigits: 1 }
        : { minimumFractionDigits: 0, maximumFractionDigits: opts.estimate ? 0 : 2 }),
    }).format(amount);
  } catch {
    // An unknown currency code must not take the page down.
    return `${currency} ${new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }).format(amount)}`;
  }
}

export type FormattedFigure =
  | { kind: "single"; value: string }
  | { kind: "range"; min: string; max: string }
  | { kind: "from"; value: string }
  | { kind: "upTo"; value: string };

/** A figure as text parts; the caller supplies the words ("from", "up to"). */
export function formatFigure(
  f: PriceFigure,
  locale: string,
  opts: { compact?: boolean } = {},
): FormattedFigure {
  const fmt = (n: number) => formatAmount(n, f.currency, locale, { estimate: f.estimate, compact: opts.compact });
  if (f.min !== null && f.max !== null) {
    const a = fmt(f.min);
    const b = fmt(f.max);
    return a === b ? { kind: "single", value: a } : { kind: "range", min: a, max: b };
  }
  if (f.min !== null) return { kind: "from", value: fmt(f.min) };
  return { kind: "upTo", value: fmt(f.max as number) };
}
