"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, requireCapabilityIn } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";

/**
 * Listing moderation (§28 step 7). Publication is the moderator's act — the
 * 00030 guard trigger enforces that at the database even if this layer
 * regressed. Rejection always carries a reason the agent sees.
 */

const PUBLISH_DAYS = 90;

const schema = z.object({
  listingId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function moderateListing(formData: FormData): Promise<void> {
  const admin = await requireCapability("listing.moderate");
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/listings?error=invalid");
  const { listingId, decision, reason } = parsed.data;

  if (decision === "reject" && !reason) {
    redirect("/admin/listings?error=reason_required");
  }

  const supabase = await createClient();
  const { data: listing } = await supabase
    .from("listings")
    .select("id, human_readable_id, title, status, agent_id, properties(country_code)")
    .eq("id", listingId)
    .single();
  if (!listing) redirect("/admin/listings?error=not_found");
  const property = (Array.isArray(listing.properties) ? listing.properties[0] : listing.properties) as
    | { country_code: string | null }
    | null;
  await requireCapabilityIn("listing.moderate", property?.country_code, "/admin/listings");
  if (!["pending_review", "published"].includes(listing.status)) {
    redirect("/admin/listings?error=not_moderatable");
  }

  const now = new Date();
  const patch =
    decision === "approve"
      ? {
          status: "published",
          moderation_state: "approved",
          moderated_by: admin.id,
          moderated_at: now.toISOString(),
          moderation_reason: reason || null,
          published_at: now.toISOString(),
          expires_at: new Date(now.getTime() + PUBLISH_DAYS * 86_400_000).toISOString(),
        }
      : {
          status: "rejected",
          moderation_state: "rejected",
          moderated_by: admin.id,
          moderated_at: now.toISOString(),
          moderation_reason: reason,
        };

  const { error } = await supabase.from("listings").update(patch).eq("id", listingId);
  if (error) redirect("/admin/listings?error=update_failed");

  // Never fire-and-forget a trail insert: RLS denials are silent and the gap
  // only shows when a dispute needs the history (README rule 6, twice earned).
  const { error: histErr } = await supabase.from("listing_status_history").insert({
    listing_id: listingId,
    previous_status: listing.status,
    new_status: patch.status,
    reason: reason || null,
    changed_by: admin.id,
  });
  if (histErr) console.error("[moderation] history insert failed:", histErr.message);

  await logAudit({
    action: decision === "approve" ? "listing.approved" : "listing.rejected",
    entityType: "listing",
    entityId: listingId,
    next: { human_readable_id: listing.human_readable_id, reason: reason || null },
  });

  // Full fan-out (in-app + push + email) needs the service client; on an
  // environment without that key the moderation itself must still complete.
  try {
    await notify({
      userId: listing.agent_id,
      kind: decision === "approve" ? "listing.approved" : "listing.rejected",
      payload: { listing: listing.human_readable_id, title: listing.title },
      href: "/listings",
    });
  } catch (e) {
    console.error("[moderation] notify failed:", e instanceof Error ? e.message : e);
  }

  redirect(`/admin/listings?done=${decision}`);
}
