"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logAudit } from "@/lib/audit";

const fieldsSchema = z.object({
  fullLegalName: z.string().trim().min(3).max(160),
  agencyName: z.string().trim().min(2).max(160),
  agencyRegistrationNumber: z.string().trim().max(80).optional().or(z.literal("")),
  licenceType: z.enum(["REN", "REA", "PEA", "AGEN_PROPERTI", "BROKER", "OTHER"]),
  licenceNumber: z.string().trim().min(2).max(80),
  licenceExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  countryCode: z.string().length(2),
  stateRegion: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  categories: z.array(z.string()).min(1),
});

const DOC_MIMES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
const MAX_DOC_BYTES = 5 * 1024 * 1024;

// Statuses from which an agent may (re)submit verification (§12)
const SUBMITTABLE = new Set([
  "draft", "email_verification_pending", "documents_pending",
  "additional_information_required", "rejected",
]);

async function uploadDoc(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  file: File,
  slot: string,
): Promise<string> {
  const ext = DOC_MIMES[file.type];
  if (!ext) throw new Error("invalid_file_type");
  if (file.size > MAX_DOC_BYTES) throw new Error("file_too_large");
  const path = `${userId}/${slot}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("agent-verification-private")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("upload_failed");
  return path;
}

export async function submitVerification(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = fieldsSchema.safeParse({
    fullLegalName: formData.get("fullLegalName"),
    agencyName: formData.get("agencyName"),
    agencyRegistrationNumber: formData.get("agencyRegistrationNumber"),
    licenceType: formData.get("licenceType"),
    licenceNumber: formData.get("licenceNumber"),
    licenceExpiry: formData.get("licenceExpiry"),
    countryCode: formData.get("countryCode"),
    stateRegion: formData.get("stateRegion"),
    city: formData.get("city"),
    categories: formData.getAll("categories").map(String),
  });
  if (!parsed.success) redirect("/verification?error=invalid_fields");

  const { data: profile } = await supabase
    .from("profiles")
    .select("agent_status")
    .eq("id", user.id)
    .single();
  if (!profile || !SUBMITTABLE.has(profile.agent_status)) {
    redirect("/verification?error=not_allowed");
  }

  const { data: existing } = await supabase
    .from("agent_profiles")
    .select("licence_document_path, identity_document_path, submitted_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const licenceFile = formData.get("licenceDocument") as File | null;
  const identityFile = formData.get("identityDocument") as File | null;
  const agencyFile = formData.get("agencyDocument") as File | null;

  // Documents required on first submission; optional replacements after.
  if (!existing?.licence_document_path && !(licenceFile && licenceFile.size > 0)) {
    redirect("/verification?error=missing_documents");
  }
  if (!existing?.identity_document_path && !(identityFile && identityFile.size > 0)) {
    redirect("/verification?error=missing_documents");
  }

  let licencePath = existing?.licence_document_path ?? null;
  let identityPath = existing?.identity_document_path ?? null;
  let agencyPath: string | null = null;
  try {
    if (licenceFile && licenceFile.size > 0)
      licencePath = await uploadDoc(supabase, user.id, licenceFile, "licence");
    if (identityFile && identityFile.size > 0)
      identityPath = await uploadDoc(supabase, user.id, identityFile, "identity");
    if (agencyFile && agencyFile.size > 0)
      agencyPath = await uploadDoc(supabase, user.id, agencyFile, "agency");
  } catch (e) {
    const code = e instanceof Error ? e.message : "upload_failed";
    redirect(`/verification?error=${code}`);
  }

  const row = {
    user_id: user.id,
    full_legal_name: parsed.data.fullLegalName,
    agency_name: parsed.data.agencyName,
    agency_registration_number: parsed.data.agencyRegistrationNumber || null,
    licence_type: parsed.data.licenceType,
    licence_number: parsed.data.licenceNumber,
    licence_expiry: parsed.data.licenceExpiry || null,
    country_code: parsed.data.countryCode,
    state_region: parsed.data.stateRegion,
    city: parsed.data.city,
    property_categories: parsed.data.categories,
    markets_served: [parsed.data.countryCode],
    licence_document_path: licencePath,
    identity_document_path: identityPath,
    ...(agencyPath ? { agency_document_path: agencyPath } : {}),
    submitted_at: new Date().toISOString(),
  };
  const { error: upsertErr } = await supabase
    .from("agent_profiles")
    .upsert(row, { onConflict: "user_id" });
  if (upsertErr) redirect("/verification?error=save_failed");

  const isResubmit = !!existing?.submitted_at;
  await supabase.from("agent_verifications").insert({
    user_id: user.id,
    action: isResubmit ? "resubmitted" : "submitted",
    acted_by: user.id,
  });

  // Status transition is admin-controlled; server flips it after authz above.
  const service = createServiceClient();
  await service
    .from("profiles")
    .update({ agent_status: "under_review" })
    .eq("id", user.id);

  await logAudit({
    action: isResubmit ? "agent.verification_resubmitted" : "agent.verification_submitted",
    entityType: "agent_profile",
    entityId: user.id,
  });

  redirect("/verification?submitted=1");
}
