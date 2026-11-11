"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { notify } from "@/lib/notifications";
import { intakePath, sha256Hex, sniffImage } from "@/lib/import/photos";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The agent answers a change request on their own listing (P1-b). The 00115
 * function checks the listing is theirs and the request still open; the
 * moderator who asked is then notified.
 */

const schema = z.object({
  listingId: z.string().uuid(),
  requestId: z.string().uuid(),
  answer: z.string().trim().min(1).max(2000),
});

export async function answerChange(formData: FormData): Promise<void> {
  await requireUser();
  const p = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!p.success) redirect(`/listings/${String(formData.get("listingId") ?? "")}/edit?changes=invalid#changes`);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agent_answer_change", { p_request: p.data.requestId, p_answer: p.data.answer });
  const r = data as { ok?: boolean; error?: string; opened_by?: string } | null;
  if (error || !r?.ok) redirect(`/listings/${p.data.listingId}/edit?changes=${r?.error ?? "failed"}#changes`);
  if (r?.opened_by) {
    try {
      await notify({ userId: r.opened_by, kind: "listing.change_answered", payload: {}, href: "/admin/handover" });
    } catch (e) {
      console.error("[change answer] notify failed:", e instanceof Error ? e.message : e);
    }
  }
  revalidatePath(`/listings/${p.data.listingId}/edit`);
  redirect(`/listings/${p.data.listingId}/edit?changes=answered#changes`);
}

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * The agent supplies the photo a moderator asked for (P1-b-2). Owner
 * decision, 11 Nov 2026: it goes PRIVATE — into the agent's own folder in
 * the intake bucket (00108 owner-write policy), recorded by
 * agent_attach_request_photo (00116) as `pending` with its provenance, then
 * through the $0 processor; it becomes public only when a moderator approves
 * the listing or resolves the request on a live listing.
 */
export async function uploadRequestPhoto(formData: FormData): Promise<void> {
  const user = await requireUser();
  const listingId = String(formData.get("listingId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const note = String(formData.get("answer") ?? "").trim().slice(0, 2000) || null;
  const back = (code: string): never => redirect(`/listings/${listingId}/edit?changes=${code}#changes`);
  if (!z.string().uuid().safeParse(listingId).success || !z.string().uuid().safeParse(requestId).success) back("invalid");
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) back("photo_required");
  const photo = file as File;
  if (photo.size > MAX_PHOTO_BYTES) back("photo_too_large");
  const bytes = new Uint8Array(await photo.arrayBuffer());
  const image = sniffImage(bytes);            // judged by its bytes, not its name or claimed type
  if (!image) back("not_image");

  const hash = await sha256Hex(bytes);
  const path = intakePath(user.id, listingId, hash, image!.ext);
  const supabase = await createClient();
  // Check the request before storing anything: RLS shows it only to the
  // listing's agent (and scoped admins), so a stranger's upload stops here.
  const { data: rq } = await supabase
    .from("listing_change_requests").select("listing_id, kind, status").eq("id", requestId).maybeSingle();
  if (!rq || rq.listing_id !== listingId) back("not_found");
  if (rq!.kind !== "photo_original") back("not_photo_request");
  if (!["open", "answered"].includes(rq!.status)) back("closed");
  const { error: upErr } = await supabase.storage
    .from("listing-media-intake")
    .upload(path, bytes, { contentType: image!.mime, upsert: false });
  if (upErr && !/exist|duplicate/i.test(upErr.message)) back("save_failed");

  const { data, error } = await supabase.rpc("agent_attach_request_photo", {
    p_request: requestId, p_storage_path: path, p_content_hash: hash,
    p_byte_size: bytes.byteLength, p_width: image!.width, p_height: image!.height, p_note: note,
  });
  const r = data as { ok?: boolean; error?: string; opened_by?: string; created?: boolean } | null;
  if (error || !r?.ok) {
    // The database refused it: do not leave the file behind. Agents have no
    // delete on the intake bucket (it is evidence), so the service client
    // removes exactly the file this request just uploaded, in their own folder.
    if (!upErr && path.startsWith(`${user.id}/`)) {
      await createServiceClient().storage.from("listing-media-intake").remove([path]);
    }
    back(r?.error ?? "save_failed");
  }
  if (r?.opened_by && r.created) {
    try {
      await notify({ userId: r.opened_by, kind: "listing.change_answered", payload: { photo: 1 }, href: "/admin/handover" });
    } catch (e) {
      console.error("[request photo] notify failed:", e instanceof Error ? e.message : e);
    }
  }
  revalidatePath(`/listings/${listingId}/edit`);
  back(r?.created ? "photo_supplied" : "photo_already");
}
