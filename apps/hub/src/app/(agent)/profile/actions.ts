"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { notifyAdmins } from "@/lib/notifications";
import { removeOldAvatar, storeCleanAvatar } from "@/lib/media/avatar";

const IMAGE_MIMES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_CARD_BYTES = 5 * 1024 * 1024;

/**
 * My company (00130): pick an agency from the directory, or add yours when it
 * is not there. Both go through database functions that keep the agency in the
 * agent's own country, refuse agents without access, and audit the change.
 */
export async function setMyAgency(formData: FormData) {
  const id = z.string().uuid().safeParse(formData.get("agencyId"));
  if (!id.success) redirect("/profile?company_error=invalid#company");
  const supabase = await createClient();
  const { data } = await supabase.rpc("agent_set_agency", { p_agency: id.data });
  const r = data as { ok?: boolean; error?: string } | null;
  if (!r?.ok) redirect(`/profile?company_error=${r?.error ?? "failed"}#company`);
  redirect("/profile?company_saved=1#company");
}

export async function addMyAgency(formData: FormData) {
  const name = z.string().trim().min(2).max(160).safeParse(formData.get("agencyName"));
  if (!name.success) redirect("/profile?company_error=invalid_name#company");
  const supabase = await createClient();
  const { data } = await supabase.rpc("agent_add_agency", { p_name: name.data });
  const r = data as { ok?: boolean; error?: string; agency?: string } | null;
  if (!r?.ok || !r.agency) redirect(`/profile?company_error=${r?.error ?? "failed"}#company`);
  const { data: set } = await supabase.rpc("agent_set_agency", { p_agency: r.agency });
  const s = set as { ok?: boolean; error?: string } | null;
  if (!s?.ok) redirect(`/profile?company_error=${s?.error ?? "failed"}#company`);
  redirect("/profile?company_saved=1#company");
}

const CERT_MIMES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf",
};

/**
 * Certificate (00131): optional; if entered, the proof is required. The file
 * goes to the private bucket in the agent's own folder (RLS: add only, never
 * overwrite), then agent_submit_certificate checks the country's certificate
 * types, the number, the expiry and that the proof is there, and records a
 * pending submission for an admin to review.
 */
export async function submitCertificate(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const p = z.object({
    certType: z.string().regex(/^[A-Z][A-Z_]{1,39}$/),
    certNumber: z.string().trim().min(3).max(60),
    expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).safeParse({ certType: formData.get("certType"), certNumber: formData.get("certNumber"), expiresOn: formData.get("expiresOn") });
  if (!p.success) redirect("/profile?cert_error=invalid#certificate");
  const proof = formData.get("proof") as File | null;
  if (!proof || proof.size === 0) redirect("/profile?cert_error=proof_required#certificate");
  const ext = CERT_MIMES[proof.type];
  if (!ext) redirect("/profile?cert_error=invalid_file_type#certificate");
  if (proof.size > MAX_CARD_BYTES) redirect("/profile?cert_error=file_too_large#certificate");
  const path = `${user.id}/certificate-${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("agent-certificates-private").upload(path, proof, { contentType: proof.type, upsert: false });
  if (upErr) redirect("/profile?cert_error=upload_failed#certificate");
  const { data } = await supabase.rpc("agent_submit_certificate", {
    p_type: p.data.certType, p_number: p.data.certNumber, p_expires: p.data.expiresOn, p_document_path: path,
  });
  const r = data as { ok?: boolean; error?: string } | null;
  if (!r?.ok) redirect(`/profile?cert_error=${r?.error ?? "failed"}#certificate`);
  await notifyAdmins({ kind: "admin.certificate_submitted", href: `/admin/agents/${user.id}` });
  redirect("/profile?cert_saved=1#certificate");
}

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

  // Profile photo → public bucket (client-facing per §71 visibility rules),
  // but never the agent's original (P1-b-4, 00118): it is re-encoded to one
  // metadata-free WebP and only that is stored, by the service client.
  const photo = formData.get("photo") as File | null;
  let photoPath: string | null = null;
  let previousPhoto: string | null = null;
  if (photo && photo.size > 0) {
    if (!IMAGE_MIMES[photo.type]) redirect("/profile?error=invalid_file_type");
    const stored = await storeCleanAvatar(user.id, new Uint8Array(await photo.arrayBuffer()));
    if (!stored.ok) redirect(`/profile?error=${stored.error}`);
    photoPath = stored.path;
    const { data: before } = await supabase.from("profiles").select("avatar_url").eq("id", user.id).single();
    previousPhoto = before?.avatar_url ?? null;
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
  if (photoPath) {
    await removeOldAvatar(user.id, previousPhoto, photoPath);
    await logAudit({
      action: "profile.avatar_updated",
      entityType: "profile",
      entityId: user.id,
      previous: { avatar_url: previousPhoto },
      next: { avatar_url: photoPath, format: "webp", cleaned: true },
    });
  }

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
