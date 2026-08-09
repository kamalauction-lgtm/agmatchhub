import "server-only";
import { publicDb } from "./supabase/public";

/**
 * Every read the marketplace performs. All of it goes through the `public_*`
 * views, which whitelist columns at the database layer — see migration 00031.
 *
 * This type mirrors `public_listings`. If a field you want is not here, it is
 * not public, and adding it means changing the view and reviewing that change
 * as security-critical code.
 */
export type PublicListing = {
  id: string;
  human_readable_id: string;
  slug: string;
  listing_type: "sale" | "rent";
  currency: string;
  price: number | null;
  rent_period: "monthly" | "yearly" | null;
  price_negotiable: boolean;
  language: string;
  title: string;
  description: string | null;
  title_en: string | null;
  description_en: string | null;
  key_selling_points: string[] | null;
  published_at: string | null;
  is_verified: boolean;
  is_featured: boolean;
  quality_score: number;
  view_count: number;

  property_id: string;
  property_category: string;
  property_type: string;
  ownership_type: string | null;
  general_address: string | null;
  building_name: string | null;
  province_name: string | null;
  regency_name: string | null;
  district_name: string | null;
  postal_code: string | null;
  location_id: string | null;
  latitude: number | null;
  longitude: number | null;
  land_size: number | null;
  building_size: number | null;
  measurement_unit: string;
  bedrooms: number | null;
  bathrooms: number | null;
  floors: number | null;
  parking_spaces: number | null;
  year_built: number | null;
  furnishing: string | null;
  property_condition: string | null;
  facilities: string[];

  agent_id: string;
  agent_display_name: string | null;
  agent_avatar_url: string | null;
  agent_agency_name: string | null;
  agent_is_verified: boolean;

  boost_weight: number;
  is_boosted: boolean;

  cover_image_path: string | null;
  cover_thumbnail_path: string | null;
  cover_alt_text: string | null;
  media_count: number;
};

export type SearchParams = {
  q?: string;
  type?: "sale" | "rent";
  category?: string;
  propertyType?: string;
  minPrice?: number;
  maxPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  locationId?: string;
  sort?: "relevance" | "newest" | "price_asc" | "price_desc";
  page?: number;
};

export const PAGE_SIZE = 24;

export type SearchResult = {
  listings: PublicListing[];
  total: number;
  page: number;
  pageCount: number;
};

/**
 * Search. Every query is bounded — there is no code path here that can return
 * an unpaginated result set to an anonymous caller (§24).
 */
/**
 * Strip the agency name from listings while the affiliation is held back.
 *
 * Applied at the data layer, not in the card component, so every consumer is
 * covered — including the next one somebody writes without remembering the
 * flag exists. The agent's own name and verification status stay: a buyer
 * still knows exactly who they are dealing with, which is the part that
 * matters to them.
 */
async function scrubAgency<T extends { agent_agency_name: string | null }>(
  rows: T[]
): Promise<T[]> {
  if (await isPartnerIdentityPublic()) return rows;
  return rows.map((r) => ({ ...r, agent_agency_name: null }));
}

export async function searchListings(params: SearchParams): Promise<SearchResult> {
  const page = Math.max(1, params.page ?? 1);
  const from = (page - 1) * PAGE_SIZE;

  let query = publicDb()
    .from("public_listings")
    .select("*", { count: "exact" })
    .range(from, from + PAGE_SIZE - 1);

  if (params.type) query = query.eq("listing_type", params.type);
  if (params.category) query = query.eq("property_category", params.category);
  if (params.propertyType) query = query.eq("property_type", params.propertyType);
  if (params.bedrooms) query = query.gte("bedrooms", params.bedrooms);
  if (params.bathrooms) query = query.gte("bathrooms", params.bathrooms);
  if (params.minPrice) query = query.gte("price", params.minPrice);
  if (params.maxPrice) query = query.lte("price", params.maxPrice);

  // Hierarchy filter: a province id matches every listing beneath it, because
  // properties carry their denormalised ancestor ids (migration 00030).
  if (params.locationId) {
    query = query.or(
      `location_id.eq.${params.locationId},ancestor_location_ids.cs.{${params.locationId}}`
    );
  }

  if (params.q) {
    const term = params.q.replace(/[%,()]/g, " ").trim();
    if (term) {
      query = query.or(
        [
          `title.ilike.%${term}%`,
          `description.ilike.%${term}%`,
          `regency_name.ilike.%${term}%`,
          `district_name.ilike.%${term}%`,
          `building_name.ilike.%${term}%`,
        ].join(",")
      );
    }
  }

  switch (params.sort) {
    case "newest":
      query = query
        .order("boost_weight", { ascending: false })
        .order("published_at", { ascending: false, nullsFirst: false });
      break;
    case "price_asc":
      query = query.order("price", { ascending: true, nullsFirst: false });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false, nullsFirst: false });
      break;
    default:
      // Quality-first ranking (§14). Promotion lifts a listing but is always
      // labelled, and it never rescues a listing that fails moderation or
      // expiry — those never reach this view at all.
      query = query
        .order("boost_weight", { ascending: false })
        .order("is_featured", { ascending: false })
        .order("ranking_score", { ascending: false })
        .order("published_at", { ascending: false, nullsFirst: false });
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`listing search failed: ${error.message}`);

  const total = count ?? 0;
  return {
    listings: await scrubAgency((data ?? []) as PublicListing[]),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getListingBySlug(slug: string): Promise<PublicListing | null> {
  const { data, error } = await publicDb()
    .from("public_listings")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`listing lookup failed: ${error.message}`);
  if (!data) return null;
  return (await scrubAgency([data as PublicListing]))[0];
}

export type PublicMedia = {
  id: string;
  listing_id: string;
  kind: string;
  processed_path: string | null;
  thumbnail_path: string | null;
  position: number;
  is_cover: boolean;
  alt_text: string | null;
  width: number | null;
  height: number | null;
};

export async function getListingMedia(listingId: string): Promise<PublicMedia[]> {
  const { data, error } = await publicDb()
    .from("public_listing_media")
    .select("*")
    .eq("listing_id", listingId)
    .limit(40);

  if (error) throw new Error(`media lookup failed: ${error.message}`);
  return (data ?? []) as PublicMedia[];
}

export type PublicLocation = {
  id: string;
  name: string;
  level: string;
  slug: string;
  path_names: string[];
  listing_count: number;
};

/** Location suggestions for the search box. Bounded, and public data only. */
export async function suggestLocations(term: string, limit = 8): Promise<PublicLocation[]> {
  const cleaned = term.replace(/[%,()]/g, " ").trim();
  if (cleaned.length < 2) return [];

  const { data, error } = await publicDb()
    .from("locations")
    .select("id,name,level,slug,path_names,listing_count")
    .eq("country_code", "ID")
    .ilike("name_normalised", `%${cleaned.toLowerCase()}%`)
    .order("listing_count", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`location lookup failed: ${error.message}`);
  return (data ?? []) as PublicLocation[];
}

/* -------------------------------------------------------------------------- */
/* Homepage facets                                                             */
/* -------------------------------------------------------------------------- */

export type PropertyTypeFacet = {
  property_type: string;
  property_category: string;
  listing_type: "sale" | "rent";
  listing_count: number;
  min_price: number | null;
};

export type LocationFacet = {
  province_name: string | null;
  regency_name: string;
  listing_type: "sale" | "rent";
  listing_count: number;
  min_price: number | null;
};

/** numeric arrives from PostgREST as a string; coerce once, at the boundary. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Counts per property type, for the "browse by type" grid (migration 00046).
 *
 * Rolled up across sale and rent when `type` is omitted, because the homepage
 * grid asks "what kinds of property are on this site", not "…for sale".
 *
 * When rolled up, `min_price` is deliberately NULL. A sale price and a monthly
 * rent are not comparable quantities, and taking the smaller of the two
 * produces a real lie: with a Rp 18 juta/month rental and a Rp 3,25 miliar
 * house on the site, "Houses from Rp 18 jt" is what the grid would say. Callers
 * that want a "from" price must ask for one listing type.
 */
export async function getPropertyTypeFacets(
  type?: "sale" | "rent"
): Promise<PropertyTypeFacet[]> {
  let q = publicDb().from("public_facet_property_types").select("*");
  if (type) q = q.eq("listing_type", type);

  const { data, error } = await q;
  if (error) throw new Error(`property type facets failed: ${error.message}`);

  const rolled = new Map<string, PropertyTypeFacet>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const key = String(row.property_type);
    const existing = rolled.get(key);
    const count = Number(row.listing_count ?? 0);
    const min = num(row.min_price);
    if (existing) {
      existing.listing_count += count;
      if (min !== null && (existing.min_price === null || min < existing.min_price)) {
        existing.min_price = min;
      }
    } else {
      rolled.set(key, {
        property_type: key,
        property_category: String(row.property_category ?? ""),
        listing_type: row.listing_type as "sale" | "rent",
        listing_count: count,
        min_price: min,
      });
    }
  }

  const out = [...rolled.values()].sort((a, b) => b.listing_count - a.listing_count);
  if (!type) for (const f of out) f.min_price = null;
  return out;
}

/**
 * Counts per kota/kabupaten, for the "browse by city" grid (migration 00046).
 *
 * Same rule as above: no "from" price when sale and rent are rolled together.
 */
export async function getLocationFacets(
  type?: "sale" | "rent",
  limit = 12
): Promise<LocationFacet[]> {
  let q = publicDb().from("public_facet_locations").select("*");
  if (type) q = q.eq("listing_type", type);

  const { data, error } = await q;
  if (error) throw new Error(`location facets failed: ${error.message}`);

  const rolled = new Map<string, LocationFacet>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const key = String(row.regency_name);
    const existing = rolled.get(key);
    const count = Number(row.listing_count ?? 0);
    const min = num(row.min_price);
    if (existing) {
      existing.listing_count += count;
      if (min !== null && (existing.min_price === null || min < existing.min_price)) {
        existing.min_price = min;
      }
    } else {
      rolled.set(key, {
        province_name: (row.province_name as string) ?? null,
        regency_name: key,
        listing_type: row.listing_type as "sale" | "rent",
        listing_count: count,
        min_price: min,
      });
    }
  }

  const out = [...rolled.values()]
    .sort((a, b) => b.listing_count - a.listing_count)
    .slice(0, limit);
  if (!type) for (const f of out) f.min_price = null;
  return out;
}

/**
 * The promoted rail. Boosted and featured listings first — and the card labels
 * them as promoted, per §14: paid placement is allowed to lift a listing, but
 * never to hide that it was paid for.
 *
 * Falls back to nothing rather than quietly filling the rail with ordinary
 * listings, so an empty promotion economy shows as an absent section instead of
 * a section that misrepresents itself.
 */
export async function getPromotedListings(limit = 4): Promise<PublicListing[]> {
  const { data, error } = await publicDb()
    .from("public_listings")
    .select("*")
    .or("is_boosted.eq.true,is_featured.eq.true")
    .order("boost_weight", { ascending: false })
    .order("ranking_score", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`promoted listings failed: ${error.message}`);
  return scrubAgency((data ?? []) as PublicListing[]);
}

/** Provinces with published stock, for the footer's SEO grid. */
export async function getProvinceFacets(): Promise<{ name: string; count: number }[]> {
  const { data, error } = await publicDb()
    .from("public_facet_locations")
    .select("province_name, listing_count");

  if (error) throw new Error(`province facets failed: ${error.message}`);

  const rolled = new Map<string, number>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const name = row.province_name as string | null;
    if (!name) continue;
    rolled.set(name, (rolled.get(name) ?? 0) + Number(row.listing_count ?? 0));
  }

  return [...rolled.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/* -------------------------------------------------------------------------- */
/* Advertising banners (migration 00047)                                       */
/* -------------------------------------------------------------------------- */

export type BannerSlot = "home_top" | "home_middle";

export type SiteBanner = {
  id: string;
  slot: BannerSlot;
  title: string;
  subtitle: string | null;
  advertiser_label: string | null;
  location_label: string | null;
  price_label: string | null;
  image_path: string | null;
  link_url: string | null;
  cta_label: string | null;
  position: number;
};

/**
 * Live banners for a slot. The view already applies the scheduling window, so
 * a campaign that has not started or has ended is not merely hidden here — it
 * is not readable by the anon key at all.
 */
export async function getBanners(slot: BannerSlot): Promise<SiteBanner[]> {
  const { data, error } = await publicDb()
    .from("public_site_banners")
    .select("*")
    .eq("slot", slot)
    .order("position", { ascending: true })
    .limit(4);

  // A failed ad query must not take the homepage down with it. Advertising is
  // the least important thing on this page; the catalogue is the most.
  if (error) {
    console.error(`banner query failed for ${slot}: ${error.message}`);
    return [];
  }
  return (data ?? []) as SiteBanner[];
}

/* -------------------------------------------------------------------------- */
/* Platform identity (migration 00048)                                         */
/* -------------------------------------------------------------------------- */

/**
 * Is the operating group's identity public yet?
 *
 * False during the neutral launch: the marketplace shows agents by name and
 * verification status, without the agency behind them. Flipped by an admin in
 * the hub once the platform stands on its own.
 *
 * Fails CLOSED. If this query errors we return false, which hides branding —
 * the reverse would reveal an affiliation the owner has deliberately held back
 * because a database hiccup happened to coincide with a page render.
 */
export async function isPartnerIdentityPublic(): Promise<boolean> {
  const { data, error } = await publicDb()
    .from("public_platform_identity")
    .select("partner_identity_public")
    .maybeSingle();

  if (error) {
    console.error(`identity flag read failed: ${error.message}`);
    return false;
  }
  return data?.partner_identity_public === true;
}
