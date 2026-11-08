import { createClient } from "@/lib/supabase/server";

/**
 * Is the operating group's identity public yet?
 *
 * Kamal's launch decision (9 Aug 2026): run neutral until the platform has
 * enough users to stand on its own, then an admin switches the affiliation on
 * from /admin/identity.
 *
 * What the flag governs — branding only:
 *   · the IQI and AG marks in the header lock-up
 *   · the agency name shown beside an agent on the public marketplace
 *   · copy in this app that names IQI by name
 *
 * What it does not govern: legal content. Terms, privacy and company details
 * are managed in /admin/legal and keep naming the operating entity, because
 * who runs a service is a disclosure obligation rather than a marketing
 * choice.
 *
 * Fails CLOSED — a read error hides the branding. Revealing an affiliation the
 * owner deliberately held back, because a query happened to fail, is the one
 * outcome that cannot be undone.
 */
export async function isPartnerIdentityPublic(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("public_platform_identity")
      .select("partner_identity_public")
      .maybeSingle();

    if (error) {
      console.error("identity flag read failed:", error.message);
      return false;
    }
    return data?.partner_identity_public === true;
  } catch (e) {
    console.error("identity flag read threw:", e);
    return false;
  }
}
