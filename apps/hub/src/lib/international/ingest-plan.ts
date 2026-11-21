/**
 * Pure rules for taking a project from an outside catalogue (no I/O, unit
 * tested in packages/db/tests/unit/ingest-plan.test.ts).
 *
 * A synced row is published only when nothing about it is doubtful. Anything
 * else is kept as a DRAFT with the reasons recorded, for a person to look at:
 * a wrong price shown to the public is worse than a missing listing.
 */

export type HoldReason =
  | "title_missing"
  | "country_invalid"
  | "currency_invalid"
  | "price_missing"
  | "price_range"
  | "price_implausible"
  | "no_photos";

export type Rooms = { min: number | null; max: number | null; label: string | null };

/** A room count above this is a typing slip in the source, not a fact. */
const MAX_ROOMS = 20;

const BLANK = /^(n\/?a|none|null|undefined|tbc|tba|-+|–+)?$/i;

/** Source placeholders ("N/A", "-", "") become null; anything else is trimmed. */
export function cleanText(v: unknown, max = 12_000): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return BLANK.test(s) ? null : s.slice(0, max);
}

/**
 * Room counts as catalogues write them: "2", "2 - 3", "2 - 6+2", "3+1 - 4+1",
 * "2 - N/A". The figures are the main rooms (before any "+n"); the label keeps
 * the source's wording only when the figures alone would lose something.
 */
export function parseRooms(v: unknown): Rooms {
  const text = cleanText(v, 40);
  if (!text) return { min: null, max: null, label: null };
  const ends = text
    .split(/\s*(?:-|–|to)\s*/i)
    .map((part) => /^(\d{1,2})(?:\s*\+\s*\d{1,2})?$/.exec(part.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    // "21" where "2 - 1" was meant has been seen; no project sells 21-bedroom units.
    .filter((n) => n <= MAX_ROOMS);
  if (!ends.length) return { min: null, max: null, label: null };
  const min = Math.min(...ends);
  const max = Math.max(...ends);
  return { min, max, label: text.includes("+") ? text.replace(/\s*(-|–)\s*n\/?a$/i, "") : null };
}

/** A position only when both halves are real numbers in range and not 0,0. */
export function cleanPosition(lat: unknown, lng: unknown): { latitude: number; longitude: number } | null {
  if (lat === null || lng === null || lat === "" || lng === "") return null;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180 || (a === 0 && b === 0)) return null;
  return { latitude: Number(a.toFixed(6)), longitude: Number(b.toFixed(6)) };
}

/**
 * Decide whether a row may be published.
 *
 * `perUsd` is the listing currency's rate (units per US dollar) when known. It
 * is used only to catch prices that cannot be real: a sale price worth less
 * than `minSaleUsd`, or a maximum more than `maxSpread` times the minimum
 * (which is what a dropped digit looks like from the other side).
 */
export function reviewListing(args: {
  title: string | null;
  countryCode: string | null;
  currency: string | null;
  priceMin: number | null;
  priceMax: number | null;
  listingType: "sale" | "rent";
  photoCount: number;
  perUsd?: number | null;
  minSaleUsd?: number;
  maxSpread?: number;
}): { status: "published" | "draft"; flags: HoldReason[] } {
  const flags: HoldReason[] = [];
  const minSaleUsd = args.minSaleUsd ?? 5000;
  const maxSpread = args.maxSpread ?? 200;
  const good = (n: number | null): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

  if (!args.title || args.title.trim().length < 3) flags.push("title_missing");
  if (!args.countryCode || !/^[A-Z]{2}$/.test(args.countryCode)) flags.push("country_invalid");
  if (!args.currency || !/^[A-Z]{3}$/.test(args.currency)) flags.push("currency_invalid");

  const { priceMin: lo, priceMax: hi } = args;
  if (!good(lo) && !good(hi)) {
    flags.push("price_missing");
  } else {
    if ((lo !== null && !good(lo)) || (hi !== null && !good(hi)) || (good(lo) && good(hi) && hi < lo)) {
      flags.push("price_range");
    } else if (good(lo) && good(hi) && hi / lo > maxSpread) {
      flags.push("price_implausible");
    } else if (args.listingType === "sale" && args.perUsd && args.perUsd > 0) {
      const lowest = Math.min(...[lo, hi].filter(good));
      if (lowest / args.perUsd < minSaleUsd) flags.push("price_implausible");
    }
  }
  if (args.photoCount < 1) flags.push("no_photos");

  return { status: flags.length ? "draft" : "published", flags };
}
