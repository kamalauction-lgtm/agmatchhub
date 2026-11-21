/**
 * Pure rules for the daily exchange-rate refresh (no I/O, so they are unit
 * tested in packages/db/tests/unit/fx-plan.test.ts).
 *
 * A rate here is "units of the currency that one US dollar buys", the shape
 * fx_rates.per_usd stores. The refresh must never publish a wrong number: a
 * price shown in rupiah is an estimate, but an estimate from a garbage rate is
 * a false price. So every incoming figure is checked, and anything doubtful is
 * left at yesterday's value and reported.
 */

export type RateRow = { currency: string; per_usd: number; as_of: string; source: string };
export type Incoming = { date: string; rates: Record<string, number> };
export type Plan = {
  write: RateRow[];
  /** Currencies we needed but will not update, with the reason. */
  held: { currency: string; reason: "missing" | "invalid" | "jump"; from?: number; to?: number }[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read the feed. Expected shape: `{ "date": "YYYY-MM-DD", "usd": { "idr": 16500, … } }`.
 * Returns null when it is not that shape, rather than guessing.
 */
export function parseFeed(json: unknown): Incoming | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const date = typeof o.date === "string" && ISO_DATE.test(o.date) ? o.date : null;
  const table = o.usd;
  if (!date || !table || typeof table !== "object") return null;
  const rates: Record<string, number> = {};
  for (const [k, v] of Object.entries(table as Record<string, unknown>)) {
    if (/^[a-z]{3}$/i.test(k) && typeof v === "number" && Number.isFinite(v) && v > 0) rates[k.toUpperCase()] = v;
  }
  // A feed based on USD must say that one dollar is one dollar.
  if (rates.USD !== undefined && Math.abs(rates.USD - 1) > 1e-9) return null;
  return Object.keys(rates).length ? { date, rates } : null;
}

/**
 * Decide what to write.
 *
 * - Only currencies in `wanted` are touched.
 * - A rate that moved more than `maxJump` (a fraction, e.g. 0.25) against a
 *   previous rate FROM A REAL SOURCE is held: currencies do not move a quarter
 *   in a day, feeds do break. A previous rate from a seed (`trustPrevious`
 *   false) is replaced without that check.
 * - A feed older than `maxAgeDays` relative to `today` writes nothing.
 */
export function planRates(args: {
  incoming: Incoming;
  previous: RateRow[];
  wanted: string[];
  source: string;
  today: string;
  maxJump?: number;
  maxAgeDays?: number;
  /** Sources whose figures are placeholders and may be overwritten freely. */
  untrustedSources?: string[];
}): Plan {
  const { incoming, previous, source, today } = args;
  const maxJump = args.maxJump ?? 0.25;
  const maxAgeDays = args.maxAgeDays ?? 5;
  const untrusted = new Set(args.untrustedSources ?? []);
  const wanted = [...new Set(["USD", ...args.wanted.map((c) => c.toUpperCase())])].filter((c) => /^[A-Z]{3}$/.test(c));
  const plan: Plan = { write: [], held: [] };

  const age = (Date.parse(today) - Date.parse(incoming.date)) / 86_400_000;
  if (!Number.isFinite(age) || age > maxAgeDays || age < -1) {
    for (const currency of wanted) plan.held.push({ currency, reason: "invalid" });
    return plan;
  }

  const before = new Map(previous.map((r) => [r.currency, r]));
  for (const currency of wanted) {
    const to = currency === "USD" ? 1 : incoming.rates[currency];
    if (to === undefined) {
      plan.held.push({ currency, reason: "missing" });
      continue;
    }
    const prev = before.get(currency);
    if (prev && !untrusted.has(prev.source) && prev.per_usd > 0) {
      const move = Math.abs(to - prev.per_usd) / prev.per_usd;
      if (move > maxJump) {
        plan.held.push({ currency, reason: "jump", from: prev.per_usd, to });
        continue;
      }
    }
    plan.write.push({ currency, per_usd: to, as_of: incoming.date, source });
  }
  return plan;
}
