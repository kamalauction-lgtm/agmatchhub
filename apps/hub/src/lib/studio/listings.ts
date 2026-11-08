import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * What the Content Studio works on: the agent's promotable inventory — their
 * own published listings plus the ones they market under co-marketing. Same
 * source as the public agent landing page (`public_agent_listings`, migration
 * 00050), read here with the signed-in agent's session.
 *
 * Ported from `apps/www/src/lib/listings.ts#getAgentListings`, including the
 * part that is easy to miss and expensive to get wrong (module design §4.4):
 * the agent fields on every row are REWRITTEN to the current agent, and a
 * borrowed listing's share link points at the BORROWER's landing page — the
 * marketplace listing page would show the original agent's contact, which is
 * exactly the leak the co-marketing module exists to prevent.
 */

export type StudioListing = {
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

  property_category: string;
  property_type: string;
  ownership_type: string | null;
  general_address: string | null;
  building_name: string | null;
  province_name: string | null;
  regency_name: string | null;
  district_name: string | null;
  land_size: number | null;
  building_size: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floors: number | null;
  parking_spaces: number | null;
  year_built: number | null;
  furnishing: string | null;
  property_condition: string | null;
  facilities: string[];
  published_at: string | null;
  cover_image_path: string | null;

  /** Always the CURRENT agent after the rewrite, never the listing's owner. */
  agent_display_name: string | null;

  /** Marketing someone else's mandate under a live engagement. */
  borrowed: boolean;
  /** Lead-capture link for THIS agent's assets. */
  share_url: string;
};

/** numeric columns can arrive from PostgREST as strings; coerce at the boundary. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Env only. A missing value throws: a share link with the wrong host must not ship. */
function marketplaceUrl(): string {
  const url = process.env.NEXT_PUBLIC_MARKETPLACE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_MARKETPLACE_URL is not set");
  return url;
}

/**
 * Public storage URL for a listing image (media lives in a public bucket).
 * Instagram's publishing API fetches the image itself, so the URL must be
 * publicly reachable — which these are, by the bucket's design.
 */
export function publicMediaUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${path.replace(/^\/+/, "")}`;
}

type Profile = { display_name: string | null; public_slug: string | null };

function toStudioListing(
  row: Record<string, unknown>,
  profile: Profile,
  ownIds: Set<string>
): StudioListing {
  const borrowed = !ownIds.has(String(row.id));
  const site = marketplaceUrl();

  return {
    id: String(row.id),
    human_readable_id: String(row.human_readable_id ?? ""),
    slug: String(row.slug ?? ""),
    listing_type: row.listing_type === "rent" ? "rent" : "sale",
    currency: String(row.currency ?? "IDR"),
    price: num(row.price),
    rent_period: (row.rent_period as "monthly" | "yearly" | null) ?? null,
    price_negotiable: row.price_negotiable !== false,
    language: String(row.language ?? "id"),
    title: String(row.title ?? ""),

    property_category: String(row.property_category ?? ""),
    property_type: String(row.property_type ?? ""),
    ownership_type: (row.ownership_type as string | null) ?? null,
    general_address: (row.general_address as string | null) ?? null,
    building_name: (row.building_name as string | null) ?? null,
    province_name: (row.province_name as string | null) ?? null,
    regency_name: (row.regency_name as string | null) ?? null,
    district_name: (row.district_name as string | null) ?? null,
    land_size: num(row.land_size),
    building_size: num(row.building_size),
    bedrooms: num(row.bedrooms),
    bathrooms: num(row.bathrooms),
    floors: num(row.floors),
    parking_spaces: num(row.parking_spaces),
    year_built: num(row.year_built),
    furnishing: (row.furnishing as string | null) ?? null,
    property_condition: (row.property_condition as string | null) ?? null,
    facilities: Array.isArray(row.facilities) ? (row.facilities as string[]) : [],
    published_at: (row.published_at as string | null) ?? null,
    cover_image_path: (row.cover_image_path as string | null) ?? null,

    agent_display_name: profile.display_name,

    borrowed,
    // Own listing → its marketplace page (leads route to the owner there).
    // Borrowed → the borrower's landing page, which carries THEIR contact. A
    // missing slug falls back to the site root — never to the marketplace
    // listing page, which would credit the original agent.
    share_url: borrowed
      ? profile.public_slug
        ? `${site}/agent/${profile.public_slug}`
        : site
      : `${site}/properti/${row.slug}`,
  };
}

/** The picker: everything the signed-in agent can promote. */
export async function getStudioListings(userId: string): Promise<StudioListing[]> {
  const supabase = await createClient();

  const [{ data: rows, error }, { data: own }, { data: profile }] = await Promise.all([
    supabase
      .from("public_agent_listings")
      .select("*")
      .eq("page_agent_id", userId)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(60),
    supabase.from("listings").select("id").eq("agent_id", userId),
    supabase.from("profiles").select("display_name, public_slug").eq("id", userId).single(),
  ]);

  if (error) throw new Error(`studio listings failed: ${error.message}`);

  const ownIds = new Set((own ?? []).map((l) => String(l.id)));
  const p: Profile = profile ?? { display_name: null, public_slug: null };
  return ((rows ?? []) as Record<string, unknown>[]).map((r) => toStudioListing(r, p, ownIds));
}

/** One listing for the workspace — null when it is not this agent's to promote. */
export async function getStudioListing(
  userId: string,
  listingId: string
): Promise<StudioListing | null> {
  const supabase = await createClient();

  const [{ data: row, error }, { data: own }, { data: profile }] = await Promise.all([
    supabase
      .from("public_agent_listings")
      .select("*")
      .eq("page_agent_id", userId)
      .eq("id", listingId)
      .maybeSingle(),
    supabase.from("listings").select("id").eq("agent_id", userId).eq("id", listingId),
    supabase.from("profiles").select("display_name, public_slug").eq("id", userId).single(),
  ]);

  if (error) throw new Error(`studio listing failed: ${error.message}`);
  if (!row) return null;

  const ownIds = new Set((own ?? []).map((l) => String(l.id)));
  const p: Profile = profile ?? { display_name: null, public_slug: null };
  return toStudioListing(row as Record<string, unknown>, p, ownIds);
}
