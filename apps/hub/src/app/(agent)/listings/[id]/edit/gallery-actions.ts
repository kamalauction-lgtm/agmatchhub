"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser } from "@/lib/authz";

/**
 * Gallery editor actions (P0-e-3a): set the cover, move a photo, remove one.
 *
 * Plain form actions, so every button works without JavaScript. Each calls a
 * 00112 function with the agent's own session: the database checks ownership,
 * applies the cover rules, writes the audit row and does it in one
 * transaction. This file only turns "move up" into a full order and deletes
 * the public files a removal hands back.
 */

const base = z.object({ listingId: z.string().uuid(), mediaId: z.string().uuid() });
const move = base.extend({ direction: z.enum(["up", "down"]) });

function back(listingId: string, code: string): never {
  revalidatePath(`/listings/${listingId}/edit`);
  redirect(`/listings/${listingId}/edit?gallery=${code}#gallery`);
}

export async function setCoverForm(formData: FormData): Promise<void> {
  await requireUser();
  const p = base.safeParse(Object.fromEntries(formData.entries()));
  if (!p.success) redirect("/listings?error=invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("listing_media_set_cover", { p_media: p.data.mediaId });
  const r = data as { ok?: boolean; error?: string } | null;
  back(p.data.listingId, error ? "failed" : r?.ok ? "cover_set" : (r?.error ?? "failed"));
}

export async function moveMediaForm(formData: FormData): Promise<void> {
  await requireUser();
  const p = move.safeParse(Object.fromEntries(formData.entries()));
  if (!p.success) redirect("/listings?error=invalid");
  const supabase = await createClient();
  // The current order, as the database will check it: every photo not removed.
  const { data: rows } = await supabase
    .from("listing_media")
    .select("id")
    .eq("listing_id", p.data.listingId)
    .neq("processing_state", "removed")
    .order("position")
    .order("created_at");
  const ids = (rows ?? []).map((r) => r.id as string);
  const i = ids.indexOf(p.data.mediaId);
  const j = p.data.direction === "up" ? i - 1 : i + 1;
  if (i < 0) back(p.data.listingId, "not_found");
  if (j < 0 || j >= ids.length) back(p.data.listingId, "moved");
  [ids[i], ids[j]] = [ids[j], ids[i]];
  const { data, error } = await supabase.rpc("listing_media_reorder", { p_listing: p.data.listingId, p_ids: ids });
  const r = data as { ok?: boolean; error?: string } | null;
  back(p.data.listingId, error ? "failed" : r?.ok ? "moved" : (r?.error ?? "failed"));
}

export async function removeMediaForm(formData: FormData): Promise<void> {
  const user = await requireUser();
  const p = base.safeParse(Object.fromEntries(formData.entries()));
  if (!p.success) redirect("/listings?error=invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("listing_media_remove", { p_media: p.data.mediaId });
  const r = data as { ok?: boolean; error?: string; public_paths?: string[] } | null;
  if (error || !r?.ok) back(p.data.listingId, error ? "failed" : (r?.error ?? "failed"));

  // Public copies go with the photo. Storage's remove() first looks the object
  // up, and the public bucket has no read policy for agents (reads are public
  // by URL), so with the agent's session it silently matches nothing. The
  // authorisation has already happened: listing_media_remove ran with the
  // agent's session, checked ownership and returned only this photo's paths.
  // The service client deletes exactly those, and only inside the agent's own
  // folder; anything else is refused and logged.
  const keys = (r!.public_paths ?? [])
    .map((path) => path.replace(/^listing-media-public\//, ""))
    .filter((key) => key.startsWith(`${user.id}/`) && !key.includes(".."));
  if (keys.length !== (r!.public_paths ?? []).length) {
    console.error("gallery remove: refused to delete paths outside the agent's folder");
  }
  if (keys.length) {
    const { error: rmErr } = await createServiceClient().storage.from("listing-media-public").remove(keys);
    if (rmErr) console.error("gallery remove: public file delete failed", rmErr.message);
  }
  back(p.data.listingId, "removed");
}
