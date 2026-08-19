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

/** Profile photos live in the public bucket at `{userId}/photo-*.ext`. */
export function profilePhotoUrl(path: string | null): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/agent-profile-public/${path.replace(/^\/+/, "")}`;
}

export function cardUrl(slug: string): string {
  const base =
    process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:8151";
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
