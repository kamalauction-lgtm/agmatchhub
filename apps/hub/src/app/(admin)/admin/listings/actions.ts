"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { publishProcessedPhotos } from "@/lib/media/publish";
import { REJECTION_CODES, type RejectionCode } from "@/lib/listings/moderation";

/**
 * Listing moderation (§28 step 7; P1-a). Publication is the moderator's act —
 * the 00030 guard trigger enforces that at the database even if this layer
 * regressed. A rejection always carries a reason code the agent sees, and a
 * note when the code is "other".
 *
 * Single and bulk decisions run the SAME path per listing (`decideOne`): the
 * country check, separation of duties and status rules apply to every listing
 * in a bulk decision individually, and one refusal never blocks the others.
 */

const PUBLISH_DAYS = 90;

const single = z.object({
  listingId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reasonCode: z.enum(REJECTION_CODES).optional().or(z.literal("")),
  reason: z.string().trim().max(1000).optional().or(z.literal("")),
  back: z.string().regex(/^\/admin\/listings(\?[\w=&%-]*)?$/).optional(),
});

type Outcome = "approved" | "rejected" | "reason_required" | "not_found" | "self_prepared" | "not_moderatable" | "update_failed";

async function decideOne(
  supabase: Awaited<ReturnType<typeof createClient>>,
  adminId: string,
  listingId: string,
  decision: "approve" | "reject",
  code: RejectionCode | null,
  note: string | null,
): Promise<Outcome> {
  if (decision === "reject" && (!code || (code === "other" && !note))) return "reason_required";

  // RLS: a moderator only sees listings in their countries (00105).
  const { data: listing } = await supabase
    .from("listings")
    .select("id, human_readable_id, title, status, agent_id, properties(country_code)")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return "not_found";
  const property = (Array.isArray(listing.properties) ? listing.properties[0] : listing.properties) as
    | { country_code: string | null } | null;
  const { data: inScope } = await supabase.rpc("has_capability_in", { p_capability: "listing.moderate", p_country: property?.country_code ?? "" });
  // Out of the moderator's countries looks exactly like not found.
  if (!inScope) return "not_found";

  // Separation of duties (00107): whoever prepared this listing's import may
  // not approve it. The database refuses it regardless.
  if (decision === "approve") {
    const { data: preparedByMe } = await supabase.rpc("prepared_by_me", { p_listing: listingId });
    if (preparedByMe) return "self_prepared";
  }
  if (!["pending_review", "published"].includes(listing.status)) return "not_moderatable";

  const now = new Date();
  const patch =
    decision === "approve"
      ? {
          status: "published",
          moderation_state: "approved",
          moderated_by: adminId,
          moderated_at: now.toISOString(),
          moderation_reason: note,
          moderation_reason_code: null,
          published_at: now.toISOString(),
          expires_at: new Date(now.getTime() + PUBLISH_DAYS * 86_400_000).toISOString(),
        }
      : {
          status: "rejected",
          moderation_state: "rejected",
          moderated_by: adminId,
          moderated_at: now.toISOString(),
          moderation_reason: note,
          moderation_reason_code: code,
        };

  // Processed photos become public with the listing: only clean derivatives,
  // and only photos with rights evidence (lib/media/publish.ts). A copy
  // failure is logged and the photo stays private; it never blocks the decision.
  let photos: { published: number; failed: number; heldNoRights: number } | null = null;
  if (decision === "approve") {
    try {
      photos = await publishProcessedPhotos(listingId);
    } catch (e) {
      console.error("[moderation] photo publish failed:", e instanceof Error ? e.message : e);
    }
  }

  const { error } = await supabase.from("listings").update(patch).eq("id", listingId);
  if (error) return "update_failed";

  // Never fire-and-forget a trail insert: RLS denials are silent and the gap
  // only shows when a dispute needs the history (README rule 6, twice earned).
  const { error: histErr } = await supabase.from("listing_status_history").insert({
    listing_id: listingId,
    previous_status: listing.status,
    new_status: patch.status,
    reason: [code ? `[${code}]` : null, note].filter(Boolean).join(" ") || null,
    changed_by: adminId,
  });
  if (histErr) console.error("[moderation] history insert failed:", histErr.message);

  await logAudit({
    action: decision === "approve" ? "listing.approved" : "listing.rejected",
    entityType: "listing",
    entityId: listingId,
    next: { human_readable_id: listing.human_readable_id, reason_code: code, reason: note, ...(photos ? { photos } : {}) },
  });

  try {
    await notify({
      userId: listing.agent_id,
      kind: decision === "approve" ? "listing.approved" : "listing.rejected",
      payload: { listing: listing.human_readable_id, title: listing.title, ...(code ? { reason_code: code } : {}) },
      href: "/listings",
    });
  } catch (e) {
    console.error("[moderation] notify failed:", e instanceof Error ? e.message : e);
  }
  return decision === "approve" ? "approved" : "rejected";
}

export async function moderateListing(formData: FormData): Promise<void> {
  const admin = await requireCapability("listing.moderate");
  const parsed = single.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/listings?error=invalid");
  const { listingId, decision, reasonCode, reason } = parsed.data;
  const back = parsed.data.back ?? "/admin/listings";
  const sep = back.includes("?") ? "&" : "?";
  const supabase = await createClient();
  const out = await decideOne(supabase, admin.id, listingId, decision, (reasonCode || null) as RejectionCode | null, reason || null);
  if (out === "approved" || out === "rejected") redirect(`${back}${sep}done=${decision}`);
  redirect(`${back}${sep}error=${out}`);
}

const bulk = z.object({
  decision: z.enum(["approve", "reject"]),
  reasonCode: z.enum(REJECTION_CODES).optional().or(z.literal("")),
  reason: z.string().trim().max(1000).optional().or(z.literal("")),
});

/** Bulk approve or reject: every selected listing goes through `decideOne`. */
export async function moderateBulk(formData: FormData): Promise<void> {
  const admin = await requireCapability("listing.moderate");
  const ids = formData.getAll("listingIds").map(String).filter((x) => z.string().uuid().safeParse(x).success).slice(0, 50);
  const parsed = bulk.safeParse({
    decision: formData.get("decision"),
    reasonCode: formData.get("reasonCode") ?? "",
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success || !ids.length) redirect("/admin/listings?error=bulk_empty");
  const { decision, reasonCode, reason } = parsed.data;
  const code = (reasonCode || null) as RejectionCode | null;
  if (decision === "reject" && (!code || (code === "other" && !reason))) redirect("/admin/listings?error=reason_required");

  const supabase = await createClient();
  const tally: Record<string, number> = {};
  for (const id of ids) {
    const out = await decideOne(supabase, admin.id, id, decision, code, reason || null);
    tally[out] = (tally[out] ?? 0) + 1;
  }
  await logAudit({
    action: "listing.bulk_moderated",
    entityType: "listing",
    next: { decision, reason_code: code, count: ids.length, listing_ids: ids, outcomes: tally },
  });
  const ok = (tally.approved ?? 0) + (tally.rejected ?? 0);
  const skipped = ids.length - ok;
  const why = Object.entries(tally).filter(([k]) => k !== "approved" && k !== "rejected").map(([k, n]) => `${k}:${n}`).join(",");
  redirect(`/admin/listings?done=bulk&ok=${ok}&skipped=${skipped}${why ? `&why=${encodeURIComponent(why)}` : ""}`);
}

const mediaSchema = z.object({ mediaId: z.string().uuid(), back: z.string().regex(/^\/admin\/(listings|media)(\?[\w=&%-]*)?$/).optional() });

/** Keep one photo out of publication. The database checks the country and capability (00114). */
export async function quarantinePhoto(formData: FormData): Promise<void> {
  await requireCapability("listing.moderate");
  const parsed = mediaSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/admin/listings?error=invalid");
  const back = parsed.data.back ?? "/admin/listings";
  const sep = back.includes("?") ? "&" : "?";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_media_quarantine", { p_media: parsed.data.mediaId });
  const r = data as { ok?: boolean; error?: string } | null;
  if (error || !r?.ok) redirect(`${back}${sep}error=${r?.error ?? "update_failed"}`);
  redirect(`${back}${sep}done=quarantined`);
}
