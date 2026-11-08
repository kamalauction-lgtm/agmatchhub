import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isPartnerIdentityPublic } from "@/lib/platform-identity";

/**
 * Digital name card data. Reads only the two public views (00050 + 00053), so
 * the card page can render for anonymous visitors — it is a sharing surface,
 * like the agent landing page.
 *
 * The agency name is scrubbed while the group identity is held back
 * (migration 00048), the same rule every public surface follows.
 */

export type CardSocialLink = {
  platform: string;
  url: string;
  display_label: string | null;
  is_verified: boolean;
};

export type AgentCard = {
  id: string;
  public_slug: string;
  display_name: string | null;
  avatar_url: string | null;
  preferred_language: string | null;
  is_verified: boolean;
  agency_name: string | null;
  city: string | null;
  state_region: string | null;
  biography: string | null;
  profile_photo_path: string | null;
  published_listing_count: number;
  links: CardSocialLink[];
};

/**
 * Profile photos live in the public bucket at `{userId}/photo-*.ext`.
 *
 * The stored column holds the object path WITHOUT its bucket, so the bucket is
 * added here. Callers must route `avatar_url` through this too: the card used
 * to fall back to the raw column when `profile_photo_path` was null, which
 * yielded a bare `d807.../photo-1.png` as an image src — a relative URL that
 * resolves against the page and 404s. That is the broken-image icon that was
 * sitting in the middle of every card whose owner had only an avatar.
 */
export function profilePhotoUrl(path: string | null): string | null {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  const clean = path.replace(/^\/+/, "");
  const withBucket = clean.startsWith("agent-profile-public/")
    ? clean
    : `agent-profile-public/${clean}`;
  return `${base}/storage/v1/object/public/${withBucket}`;
}

/** The photo to show, whichever column the agent actually has. */
export function cardPhotoUrl(card: Pick<AgentCard, "profile_photo_path" | "avatar_url">) {
  return profilePhotoUrl(card.profile_photo_path ?? card.avatar_url);
}

export type CardListing = {
  id: string;
  slug: string;
  title: string;
  price: number | null;
  currency: string | null;
  listing_type: string | null;
  property_type: string | null;
  regency_name: string | null;
  province_name: string | null;
  bedrooms: number | null;
  building_size: number | null;
  measurement_unit: string | null;
  cover_image_path: string | null;
};

/**
 * A few of the agent's live listings, for the card.
 *
 * A name card that only says "30 active" asks the reader to take a leap. Three
 * real properties, with prices, is the difference between a claim and evidence
 * — and it is the same public view the marketplace reads, so nothing
 * confidential can reach it.
 */
export async function getAgentCardListings(agentId: string, limit = 3): Promise<CardListing[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("public_agent_listings")
    .select(
      "id, slug, title, price, currency, listing_type, property_type, regency_name, province_name, bedrooms, building_size, measurement_unit, cover_image_path"
    )
    .eq("page_agent_id", agentId)
    .order("published_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as CardListing[];
}

/** Env only. A missing base throws: a card link must never point at a dev server. */
export function cardUrl(slug: string): string {
  const base = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!base) throw new Error("APP_BASE_URL is not set");
  return `${base}/c/${slug}`;
}

export async function getAgentCard(slug: string): Promise<AgentCard | null> {
  const supabase = await createClient();

  const { data: agent, error } = await supabase
    .from("public_agent_profiles")
    .select(
      "id, public_slug, display_name, avatar_url, preferred_language, is_verified, agency_name, city, state_region, biography, profile_photo_path, published_listing_count"
    )
    .eq("public_slug", slug)
    .maybeSingle();
  if (error || !agent) return null;

  const [{ data: links }, identityPublic] = await Promise.all([
    supabase
      .from("public_agent_social_links")
      .select("platform, url, display_label, is_verified")
      .eq("user_id", agent.id),
    isPartnerIdentityPublic(),
  ]);

  return {
    ...(agent as Omit<AgentCard, "links">),
    agency_name: identityPublic ? agent.agency_name : null,
    published_listing_count: Number(agent.published_listing_count ?? 0),
    links: (links ?? []) as CardSocialLink[],
  };
}
