"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { verifyLinkSession, linkCookieName } from "@/lib/request-links";
import { getActiveDeclaration, recordConsent } from "@/lib/consents";
import { logAudit } from "@/lib/audit";
import { getLocale } from "next-intl/server";

const optNum = z.string().trim().transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().nonnegative().nullable());
const optInt = z.string().trim().transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().int().nonnegative().nullable());
const optText = z.string().trim().max(5000).transform((v) => (v === "" ? null : v));

const SOURCE_TYPES = [
  "direct_written_appointment", "direct_appointment_pending",
  "direct_verbal_authorisation", "direct_no_appointment", "indirect_other_agent",
  "co_agent", "agency_shared", "developer", "landlord_referral", "open_market", "other",
] as const;

const schema = z.object({
  title: z.string().trim().min(5).max(200),
  propertyCategory: z.enum(["residential", "commercial", "industrial", "land", "other"]),
  propertyType: optText,
  stateRegion: optText,
  city: z.string().trim().min(2).max(120),
  district: optText,
  fullAddress: optText,
  generalAddress: optText,
  buildingName: optText,
  unitNumber: optText,
  currency: z.string().length(3),
  askingPrice: optNum,
  monthlyRental: optNum,
  negotiable: z.enum(["yes", "no", "subject_to_offer"]),
  minAcceptablePrice: optNum,
  measurementUnit: z.enum(["sqft", "sqm"]),
  builtUp: optNum,
  landArea: optNum,
  bedrooms: optInt,
  bathrooms: optInt,
  carParks: optInt,
  floorLevel: optText,
  furnishing: z.enum(["", "unfurnished", "partially", "fully"]),
  tenure: optText,
  completionYear: optInt,
  availabilityDate: z.string().trim().transform((v) => (v === "" ? null : v))
    .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()),
  vacant: z.enum(["", "yes", "no"]),
  facilities: optText,
  description: optText,
  keySellingPoints: optText,
  clientSafeRemarks: optText,
  internalRemarks: optText,
  ownerConfirmationStatus: z.enum(["", "confirmed", "pending", "not_obtained"]),
  appointmentStatus: z.enum(["", "written_appointment", "appointment_pending", "verbal_authorisation", "none"]),
  sourceType: z.enum(SOURCE_TYPES),
  sourceAgentName: optText,
  sourceAgency: optText,
  sourcePermission: z.enum(["", "yes", "no"]),
  chainAgentCount: optInt,
  commissionType: z.enum(["", "percentage", "fixed", "rental_months"]),
  commissionPercentage: optNum,
  commissionAmount: optNum,
  commissionMonths: optNum,
  commissionConditions: optText,
  declarationAccepted: z.literal("on"),          // must be actively ticked (§28)
});

function deriveRisk(sourceType: string, permission: string): string {
  switch (sourceType) {
    case "direct_written_appointment":
    case "direct_appointment_pending":
    case "direct_verbal_authorisation":
    case "developer":
    case "landlord_referral":
      return "direct_document_pending";
    case "direct_no_appointment":
    case "other":
      return "high_risk";
    case "indirect_other_agent":
    case "co_agent":
    case "agency_shared":
      return permission === "yes" ? "indirect_verified_source" : "indirect_limited_verification";
    case "open_market":
      return "open_market_confirmation_required";
    default:
      return "high_risk";
  }
}

const IMG_MIMES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};
const MAX_IMG_BYTES = 10 * 1024 * 1024;

export async function submitProperty(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const back = `/r/${encodeURIComponent(token)}/submit`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(back)}`);

  const { data: profile } = await supabase
    .from("profiles").select("agent_status").eq("id", user.id).single();
  if (profile?.agent_status !== "verified") redirect("/verification");

  // Link must be valid AND this browser must have passed the password gate
  const service = createServiceClient();
  const { data: link } = await service
    .from("request_links")
    .select("id, request_id, active, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!link || !link.active || new Date(link.expires_at) < new Date()) {
    redirect(`/r/${encodeURIComponent(token)}`);
  }
  const unlocked = verifyLinkSession(
    (await cookies()).get(linkCookieName(link.id))?.value, link.id,
  );
  if (!unlocked) redirect(`/r/${encodeURIComponent(token)}`);

  const raw: Record<string, string> = {};
  for (const key of Object.keys(schema.shape)) raw[key] = String(formData.get(key) ?? "");
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const declMissing = parsed.error.issues.some((i) => i.path[0] === "declarationAccepted");
    redirect(`${back}?error=${declMissing ? "declaration_required" : "invalid_fields"}`);
  }
  const d = parsed.data;

  if (d.askingPrice == null && d.monthlyRental == null) {
    redirect(`${back}?error=price_required`);
  }

  // Cover image required (§58); up to 5 extra gallery images
  const cover = formData.get("coverImage") as File | null;
  if (!cover || cover.size === 0) redirect(`${back}?error=cover_required`);
  const gallery = (formData.getAll("galleryImages") as File[])
    .filter((f) => f && f.size > 0).slice(0, 5);

  const uploadImage = async (file: File, label: string): Promise<string> => {
    const ext = IMG_MIMES[file.type];
    if (!ext) throw new Error("invalid_file_type");
    if (file.size > MAX_IMG_BYTES) throw new Error("file_too_large");
    const path = `${user.id}/${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from("property-original-private")
      .upload(path, file, { contentType: file.type });
    if (error) throw new Error("upload_failed");
    return path;
  };

  let coverPath: string;
  const galleryPaths: string[] = [];
  try {
    coverPath = await uploadImage(cover, "cover");
    for (const g of gallery) galleryPaths.push(await uploadImage(g, "gallery"));
  } catch (e) {
    redirect(`${back}?error=${e instanceof Error ? e.message : "upload_failed"}`);
  }

  // Declaration: re-fetch active version server-side and record exact text (§31)
  const locale = await getLocale();
  const declaration = await getActiveDeclaration("supply_agent_submission", locale);
  if (!declaration) redirect(`${back}?error=save_failed`);

  const { data: humanId, error: idErr } = await supabase.rpc("next_human_id", { p_prefix: "SUB" });
  if (idErr) redirect(`${back}?error=save_failed`);

  const risk = deriveRisk(d.sourceType, d.sourcePermission);

  const { data: inserted, error: insErr } = await supabase
    .from("property_submissions")
    .insert({
      human_readable_id: humanId,
      request_id: link.request_id,
      supply_agent_id: user.id,
      status: "submitted",
      title: d.title,
      property_category: d.propertyCategory,
      property_type: d.propertyType,
      country_code: (await service.from("property_requests").select("country_code").eq("id", link.request_id).single()).data?.country_code ?? "MY",
      state_region: d.stateRegion,
      city: d.city,
      district: d.district,
      full_address: d.fullAddress,
      general_address: d.generalAddress,
      building_name: d.buildingName,
      unit_number: d.unitNumber,
      currency: d.currency,
      asking_price: d.askingPrice,
      monthly_rental: d.monthlyRental,
      negotiable: d.negotiable,
      measurement_unit: d.measurementUnit,
      built_up: d.builtUp,
      land_area: d.landArea,
      bedrooms: d.bedrooms,
      bathrooms: d.bathrooms,
      car_parks: d.carParks,
      floor_level: d.floorLevel,
      furnishing: d.furnishing || null,
      tenure: d.tenure,
      completion_year: d.completionYear,
      availability_date: d.availabilityDate,
      vacant: d.vacant === "" ? null : d.vacant === "yes",
      facilities: d.facilities ? d.facilities.split(",").map((s) => s.trim()).filter(Boolean) : [],
      description: d.description,
      key_selling_points: d.keySellingPoints,
      client_safe_remarks: d.clientSafeRemarks,
      owner_confirmation_status: d.ownerConfirmationStatus || null,
      appointment_status: d.appointmentStatus || null,
      source_type: d.sourceType,
      risk_indicator: risk,
      cobroke_accepted: true,
      commission_type: d.commissionType || null,
      commission_percentage: d.commissionPercentage,
      commission_amount: d.commissionAmount,
      commission_months: d.commissionMonths,
      commission_currency: d.commissionType ? d.currency : null,
      commission_conditions: d.commissionConditions,
    })
    .select("id")
    .single();
  if (insErr || !inserted) redirect(`${back}?error=save_failed`);
  const submissionId = inserted.id;

  // Confidential companion + source detail + media + history (RLS: SA-own)
  if (d.minAcceptablePrice != null || d.internalRemarks) {
    await supabase.from("property_submission_private").insert({
      submission_id: submissionId,
      min_acceptable_price: d.minAcceptablePrice,
      internal_remarks: d.internalRemarks,
    });
  }
  if (d.sourceType.startsWith("indirect") || ["co_agent", "agency_shared", "other"].includes(d.sourceType)) {
    await supabase.from("property_submission_sources").insert({
      submission_id: submissionId,
      source_agent_name: d.sourceAgentName,
      source_agency: d.sourceAgency,
      permission_to_share: d.sourcePermission === "" ? null : d.sourcePermission === "yes",
      chain_agent_count: d.chainAgentCount,
    });
  }
  await supabase.from("property_submission_media").insert([
    { submission_id: submissionId, storage_path: coverPath, kind: "image", is_cover: true, position: 0 },
    ...galleryPaths.map((p, i) => ({
      submission_id: submissionId, storage_path: p, kind: "image" as const, is_cover: false, position: i + 1,
    })),
  ]);
  await supabase.from("submission_status_history").insert({
    submission_id: submissionId,
    previous_status: null,
    new_status: "submitted",
    changed_by: user.id,
    actor_role: "supply_agent",
  });

  await recordConsent({ declaration, submissionRef: submissionId });
  await logAudit({
    action: "submission.created",
    entityType: "property_submission",
    entityId: submissionId,
    next: { human_id: humanId, request_id: link.request_id, risk },
  });

  redirect(`/submissions?submitted=${humanId}`);
}
