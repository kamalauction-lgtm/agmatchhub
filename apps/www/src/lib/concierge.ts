import "server-only";
import { market } from "@/config/market";
import {
  findLocationByName,
  getLocationFacets,
  getProvinceFacets,
  searchListings,
  type PublicListing,
  type SearchParams,
} from "./listings";
import { parseRequest, type KnownPlace, type ParsedRequest } from "./concierge-parse";

/**
 * The Smart Property Concierge — orchestration.
 *
 * One request → parse → the SAME search the results page runs → explain what
 * matched → if nothing matched, relax one criterion at a time and say which.
 * Everything the visitor sees comes from `public_listings`; nothing here
 * invents a listing, a score or a recommendation.
 *
 * PROVIDER BOUNDARY
 *   `ConciergeParser` is the single seam for a model-powered parser later. A
 *   future adapter would read `CONCIERGE_PROVIDER` (server-side, never
 *   NEXT_PUBLIC_), call the provider through the hub's AI gateway with its own
 *   budget and audit row, and return the same `ParsedRequest` shape. Until an
 *   owner approves a provider key, the only parser is the deterministic one
 *   and `provider` is always "rules" — the UI prints that label.
 */
export interface ConciergeParser {
  readonly provider: "rules";
  parse(input: string, places: KnownPlace[]): Promise<ParsedRequest>;
}

const rulesParser: ConciergeParser = {
  provider: "rules",
  async parse(input, places) {
    return parseRequest(input, places, market.currency);
  },
};

export function getParser(): ConciergeParser {
  const requested = process.env.CONCIERGE_PROVIDER ?? "rules";
  if (requested !== "rules") {
    // Loud in logs, safe in behaviour: an unapproved provider setting never
    // silently activates anything.
    console.warn(`CONCIERGE_PROVIDER="${requested}" is not implemented; using rules.`);
  }
  return rulesParser;
}

export type Criterion = {
  key: "type" | "propertyType" | "bedrooms" | "bathrooms" | "minPrice" | "maxPrice" | "place";
  value: string | number;
  /** Still applied in the result shown, or dropped by relaxation. */
  applied: boolean;
};

export type RelaxStep = { key: Criterion["key"]; from: string | number; to: string | number | null };

export type ConciergeResult = {
  provider: "rules";
  query: string;
  parsed: ParsedRequest;
  criteria: Criterion[];
  unrecognised: string[];
  /** The search actually executed to produce `listings`. */
  effective: SearchParams;
  exact: boolean;
  relaxed: RelaxStep[];
  listings: PublicListing[];
  total: number;
};

/** Common short forms a buyer types that are not catalogue names. */
const ALIASES: Record<string, string[]> = {
  "Jakarta Selatan": ["jaksel", "south jakarta"],
  "Jakarta Pusat": ["jakpus", "central jakarta"],
  "Jakarta Barat": ["jakbar", "west jakarta"],
  "Jakarta Utara": ["jakut", "north jakarta"],
  "Jakarta Timur": ["jaktim", "east jakarta"],
  "DKI Jakarta": ["jakarta", "dki"],
  "Kab. Badung": ["badung", "canggu", "seminyak", "kuta", "jimbaran", "uluwatu"],
  "Denpasar": ["denpasar", "renon", "sanur"],
  "Bali": ["bali"],
  "Jawa Barat": ["west java"],
  "Jawa Timur": ["east java"],
};

async function knownPlaces(): Promise<KnownPlace[]> {
  const [cities, provinces] = await Promise.all([getLocationFacets(undefined, 100), getProvinceFacets()]);
  const names = new Set<string>();
  for (const c of cities) names.add(c.regency_name);
  for (const p of provinces) names.add(p.name);
  for (const k of Object.keys(ALIASES)) names.add(k);
  return [...names].map((name) => ({ name, aliases: ALIASES[name] }));
}

function toSearch(p: ParsedRequest, locationId?: string): SearchParams {
  return {
    type: p.type,
    propertyType: p.propertyType,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    minPrice: p.minPrice,
    maxPrice: p.maxPrice,
    locationId,
    // Fall back to text match on the place when it is not a location row.
    q: !locationId && p.place ? p.place : undefined,
    sort: "relevance",
    page: 1,
  };
}

export async function runConcierge(query: string): Promise<ConciergeResult> {
  const parser = getParser();
  const places = await knownPlaces();
  const parsed = await parser.parse(query.slice(0, 300), places);

  const location = parsed.place ? await findLocationByName(parsed.place) : null;
  const base = toSearch(parsed, location?.id);

  const criteria: Criterion[] = [];
  if (parsed.type) criteria.push({ key: "type", value: parsed.type, applied: true });
  if (parsed.propertyType) criteria.push({ key: "propertyType", value: parsed.propertyType, applied: true });
  if (parsed.bedrooms) criteria.push({ key: "bedrooms", value: parsed.bedrooms, applied: true });
  if (parsed.bathrooms) criteria.push({ key: "bathrooms", value: parsed.bathrooms, applied: true });
  if (parsed.minPrice) criteria.push({ key: "minPrice", value: parsed.minPrice, applied: true });
  if (parsed.maxPrice) criteria.push({ key: "maxPrice", value: parsed.maxPrice, applied: true });
  if (parsed.place) criteria.push({ key: "place", value: location?.name ?? parsed.place, applied: true });

  let result = await searchListings(base);
  let effective = base;
  const relaxed: RelaxStep[] = [];

  // Relaxation ladder: the least decisive criterion goes first, the place
  // last. Each step is recorded so the page can say exactly what changed.
  const ladder: Array<() => RelaxStep | null> = [
    () => (effective.bathrooms ? { key: "bathrooms", from: effective.bathrooms, to: null } : null),
    () => (effective.maxPrice ? { key: "maxPrice", from: effective.maxPrice, to: Math.round(effective.maxPrice * 1.25) } : null),
    () => (effective.bedrooms && effective.bedrooms > 1 ? { key: "bedrooms", from: effective.bedrooms, to: effective.bedrooms - 1 } : null),
    () => (effective.bedrooms ? { key: "bedrooms", from: effective.bedrooms, to: null } : null),
    () => (effective.propertyType ? { key: "propertyType", from: effective.propertyType, to: null } : null),
    () => (effective.minPrice ? { key: "minPrice", from: effective.minPrice, to: null } : null),
    () => (effective.locationId || effective.q ? { key: "place", from: parsed.place ?? "", to: null } : null),
  ];

  for (const step of ladder) {
    if (result.total > 0) break;
    const change = step();
    if (!change) continue;
    const next: SearchParams = { ...effective };
    switch (change.key) {
      case "bathrooms": delete next.bathrooms; break;
      case "maxPrice": next.maxPrice = change.to as number; break;
      case "bedrooms": if (change.to === null) delete next.bedrooms; else next.bedrooms = change.to as number; break;
      case "propertyType": delete next.propertyType; break;
      case "minPrice": delete next.minPrice; break;
      case "place": delete next.locationId; delete next.q; break;
      default: break;
    }
    relaxed.push(change);
    effective = next;
    result = await searchListings(effective);
  }

  for (const c of criteria) {
    const dropped = relaxed.some((r) => r.key === c.key && r.to === null);
    if (dropped) c.applied = false;
  }

  return {
    provider: parser.provider,
    query,
    parsed,
    criteria,
    unrecognised: parsed.unrecognised,
    effective,
    exact: relaxed.length === 0,
    relaxed,
    listings: result.listings.slice(0, 12),
    total: result.total,
  };
}
