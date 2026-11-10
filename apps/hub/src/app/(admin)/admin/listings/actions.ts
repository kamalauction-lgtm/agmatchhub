"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, requireCapabilityIn } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { createServiceClient } from "@/lib/supabase/service";
import { publishProcessedPhotos } from "@/lib/media/publish";

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

  // Separation of duties (00107): whoever prepared this listing's import may
  // not approve it. The database refuses it regardless.
  if (decision === "approve") {
    const { data: preparedByMe } = await supabase.rpc("prepared_by_me", { p_listing: listingId });
    if (preparedByMe) redirect("/admin/listings?error=self_prepared");
  }
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

  // Processed imported photos (00109) become public with the listing: copy
  // the clean derivatives first so it is published with them. A copy failure
  // is logged and the photo stays private; it never blocks the decision.
  let photos: { published: number; failed: number } | null = null;
  if (decision === "approve") {
    try {
      photos = await publishProcessedPhotos(listingId);
    } catch (e) {
      console.error("[moderation] photo publish failed:", e instanceof Error ? e.message : e);
    }
  }

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
    next: { human_readable_id: listing.human_readable_id, reason: reason || null, ...(photos ? { photos } : {}) },
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

const quarantineSchema = z.object({ mediaId: z.string().uuid() });

/**
 * Keep one imported photo out of publication (P0-e-2a). The moderator must
 * hold listing.moderate for the listing's country; the state change runs on
 * the operator path because client sessions cannot change an intake photo.
 */
export async function quarantinePhoto(formData: FormData): Promise<void> {
  await requireCapability("listing.moderate");
  const parsed = quarantineSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/listings?error=invalid");
  const supabase = await createClient();
  // RLS: the moderator only sees media of listings in their countries.
  const { data: media } = await supabase
    .from("listing_media")
    .select("id, listing_id, processing_state, storage_path, listings(properties(country_code))")
    .eq("id", parsed.data.mediaId)
    .maybeSingle();
  if (!media) redirect("/admin/listings?error=not_found");
  const lst = (Array.isArray(media.listings) ? media.listings[0] : media.listings) as
    | { properties: { country_code: string | null } | { country_code: string | null }[] | null }
    | null;
  const prop = Array.isArray(lst?.properties) ? lst?.properties[0] : lst?.properties;
  await requireCapabilityIn("listing.moderate", prop?.country_code, "/admin/listings");
  if (!["pending", "processing", "processed", "failed"].includes(media.processing_state as string)) {
    redirect("/admin/listings?error=not_moderatable");
  }
  const { error } = await createServiceClient()
    .from("listing_media")
    .update({ processing_state: "quarantined" })
    .eq("id", media.id);
  if (error) redirect("/admin/listings?error=update_failed");
  await logAudit({
    action: "listing_media.quarantined",
    entityType: "listing_media",
    entityId: media.id,
    previous: { processing_state: media.processing_state },
    next: { processing_state: "quarantined", listing_id: media.listing_id },
  });
  redirect("/admin/listings?done=quarantined");
}
