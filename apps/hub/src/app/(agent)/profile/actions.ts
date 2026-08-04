"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const IMAGE_MIMES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_CARD_BYTES = 5 * 1024 * 1024;

export async function updateTrustProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z
    .object({
      displayName: z.string().trim().min(2).max(80),
      biography: z.string().trim().max(2000),
      whatsapp: z.string().trim().max(30),
      mobile: z.string().trim().max(30),
    })
    .safeParse({
      displayName: formData.get("displayName"),
      biography: String(formData.get("biography") ?? ""),
      whatsapp: String(formData.get("whatsapp") ?? ""),
      mobile: String(formData.get("mobile") ?? ""),
    });
  if (!parsed.success) redirect("/profile?error=invalid_fields");
  const d = parsed.data;

  // Profile photo → public bucket (client-facing per §71 visibility rules)
  const photo = formData.get("photo") as File | null;
  let photoPath: string | null = null;
  if (photo && photo.size > 0) {
    const ext = IMAGE_MIMES[photo.type];
    if (!ext) redirect("/profile?error=invalid_file_type");
    if (photo.size > MAX_PHOTO_BYTES) redirect("/profile?error=file_too_large");
    photoPath = `${user.id}/photo-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("agent-profile-public")
      .upload(photoPath, photo, { contentType: photo.type });
    if (error) redirect("/profile?error=upload_failed");
  }

  // Name card images → private bucket (§71: controlled, never public)
  const uploadCard = async (field: string, slot: string): Promise<string | null> => {
    const f = formData.get(field) as File | null;
    if (!f || f.size === 0) return null;
    const ext = IMAGE_MIMES[f.type] ?? (f.type === "application/pdf" ? "pdf" : null);
    if (!ext) redirect("/profile?error=invalid_file_type");
    if (f.size > MAX_CARD_BYTES) redirect("/profile?error=file_too_large");
    const path = `${user.id}/${slot}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from("agent-verification-private")
      .upload(path, f, { contentType: f.type });
    if (error) redirect("/profile?error=upload_failed");
    return path;
  };
  const cardFront = await uploadCard("nameCardFront", "namecard-front");
  const cardBack = await uploadCard("nameCardBack", "namecard-back");

  const { error: profErr } = await supabase
    .from("profiles")
    .update({
      display_name: d.displayName,
      ...(photoPath ? { avatar_url: photoPath } : {}),
    })
    .eq("id", user.id);
  if (profErr) redirect("/profile?error=save_failed");

  await supabase
    .from("users_private")
    .update({ whatsapp_number: d.whatsapp || null, mobile_number: d.mobile || null })
    .eq("user_id", user.id);

  const apPatch: Record<string, string> = {};
  if (d.biography) apPatch.biography = d.biography;
  if (cardFront) apPatch.name_card_front_path = cardFront;
  if (cardBack) apPatch.name_card_back_path = cardBack;
  if (Object.keys(apPatch).length) {
    await supabase.from("agent_profiles").update(apPatch).eq("user_id", user.id);
  }

  await logAudit({
    action: "trust_profile.updated",
    entityType: "agent_profile",
    entityId: user.id,
  });
  redirect("/profile?saved=1");
}

const PLATFORMS = ["facebook", "instagram", "linkedin", "tiktok", "youtube",
  "whatsapp", "telegram", "website", "agency_profile", "other"] as const;

export async function addSocialLink(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z
    .object({
      platform: z.enum(PLATFORMS),
      url: z.string().trim().url().max(500)
        .refine((u) => u.startsWith("https://") || u.startsWith("http://")),
      label: z.string().trim().max(80),
      visibility: z.enum(["admin_only", "collaborators", "after_contact_release", "public_profile"]),
    })
    .safeParse({
      platform: formData.get("platform"),
      url: formData.get("url"),
      label: String(formData.get("label") ?? ""),
      visibility: formData.get("visibility"),
    });
  if (!parsed.success) redirect("/profile?error=invalid_url");
  const d = parsed.data;

  const { error } = await supabase.from("agent_social_links").insert({
    user_id: user.id,
    platform: d.platform,
    url: d.url,
    display_label: d.label || null,
    visibility: d.visibility,
  });
  if (error) redirect("/profile?error=save_failed");

  await logAudit({
    action: "trust_profile.link_added",
    entityType: "agent_social_link",
    entityId: d.platform,
  });
  redirect("/profile?saved=1");
}

export async function removeSocialLink(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const id = z.string().uuid().safeParse(formData.get("linkId"));
  if (!id.success) redirect("/profile");
  await supabase.from("agent_social_links").delete().eq("id", id.data);
  redirect("/profile?saved=1");
}
