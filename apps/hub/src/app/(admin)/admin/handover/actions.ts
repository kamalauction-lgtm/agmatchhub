"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { notify } from "@/lib/notifications";
import { publishProcessedPhotos } from "@/lib/media/publish";

/**
 * Change requests, moderator side (P1-b, screen 14). Each is one 00115
 * database function called with the moderator's own session: the database
 * checks listing.moderate for the listing's country, writes the row and the
 * audit entry. The agent is then notified; a notification failure never
 * undoes the request.
 */

const back = z.string().regex(/^\/admin\/(listings|handover)(\?[\w=&%-]*)?$/).optional();
const requestSchema = z.object({
  listingId: z.string().uuid(),
  kind: z.enum(["correction", "photo_original"]),
  field: z.enum(["", "title", "description", "price", "location", "property_details", "photos", "other"]).optional(),
  body: z.string().trim().min(3).max(2000),
  back,
});

function to(path: string | undefined, key: string, value: string): never {
  const b = path ?? "/admin/handover";
  redirect(`${b}${b.includes("?") ? "&" : "?"}${key}=${value}`);
}

export async function requestChange(formData: FormData): Promise<void> {
  await requireCapability("listing.moderate");
  const p = requestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!p.success) to(String(formData.get("back") ?? "") || undefined, "error", "change_invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_request_change", {
    p_listing: p.data.listingId, p_kind: p.data.kind, p_field: p.data.field ?? "", p_body: p.data.body,
  });
  const r = data as { ok?: boolean; error?: string; agent?: string } | null;
  if (error || !r?.ok) to(p.data.back, "error", r?.error ?? "update_failed");
  const { data: l } = await supabase.from("listings").select("human_readable_id, title").eq("id", p.data.listingId).maybeSingle();
  try {
    await notify({
      userId: r!.agent!,
      kind: p.data.kind === "photo_original" ? "listing.photo_original_requested" : "listing.change_requested",
      payload: { listing: l?.human_readable_id, title: l?.title },
      href: `/listings/${p.data.listingId}/edit#changes`,
    });
  } catch (e) {
    console.error("[change request] notify failed:", e instanceof Error ? e.message : e);
  }
  revalidatePath("/admin/handover");
  to(p.data.back, "done", "change_requested");
}

const closeSchema = z.object({ requestId: z.string().uuid(), outcome: z.enum(["resolved", "withdrawn"]), back });

export async function closeChange(formData: FormData): Promise<void> {
  await requireCapability("listing.moderate");
  const p = closeSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!p.success) to(undefined, "error", "change_invalid");
  const supabase = await createClient();
  // Read before closing (RLS: only requests in the moderator's countries are visible).
  const { data: before } = await supabase
    .from("listing_change_requests").select("listing_id, kind, listings (status)").eq("id", p.data.requestId).maybeSingle();
  const { data, error } = await supabase.rpc("admin_close_change", { p_request: p.data.requestId, p_outcome: p.data.outcome });
  const r = data as { ok?: boolean; error?: string; agent?: string } | null;
  if (error || !r?.ok) to(p.data.back, "error", r?.error ?? "update_failed");
  // P1-b-2: resolving an original-photo request on a LIVE listing publishes the
  // agent's processed photo — the moderator's act, after the database checked
  // their country. Only processed photos with rights evidence are copied
  // (lib/media/publish.ts); one still processing stays private until a later
  // approval. Listings awaiting review publish on approval as before.
  let published = 0;
  const listingStatus = (Array.isArray(before?.listings) ? before?.listings[0] : before?.listings) as { status?: string } | null | undefined;
  if (p.data.outcome === "resolved" && before?.kind === "photo_original" && listingStatus?.status === "published") {
    try {
      published = (await publishProcessedPhotos(before.listing_id)).published;
    } catch (e) {
      console.error("[change request] photo publish failed:", e instanceof Error ? e.message : e);
    }
  }
  if (p.data.outcome === "resolved" && r?.agent) {
    try {
      await notify({ userId: r.agent, kind: "listing.change_resolved", payload: {}, href: "/listings" });
    } catch (e) {
      console.error("[change request] notify failed:", e instanceof Error ? e.message : e);
    }
  }
  revalidatePath("/admin/handover");
  to(p.data.back, "done", published > 0 ? "change_resolved_published" : `change_${p.data.outcome}`);
}
