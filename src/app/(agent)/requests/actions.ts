"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const optNum = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().nonnegative().nullable());

const optInt = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().int().nonnegative().nullable());

const optDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());

const optText = z.string().trim().max(5000).transform((v) => (v === "" ? null : v));

const schema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  intent: z.enum(["draft", "submit"]),
  title: z.string().trim().min(5).max(200),
  description: optText,
  transactionType: z.enum(["buy", "rent"]),
  propertyCategory: z.enum(["residential", "commercial", "industrial", "land", "other"]),
  clientType: z.enum(["individual", "company", "organisation"]),
  priority: z.enum(["normal", "high", "urgent"]),
  submissionDeadline: optDate,
  expiryDate: optDate,
  countryCode: z.string().length(2),
  stateRegion: optText,
  city: z.string().trim().min(2).max(120),
  district: optText,
  preferredAreas: optText,
  currency: z.string().length(3),
  budgetMin: optNum,
  budgetMax: optNum,
  maxMonthlyRent: optNum,
  leaseTermMonths: optInt,
  financing: z.enum(["", "cash", "financing", "pre_approved", "undecided"]),
  propertyType: optText,
  measurementUnit: z.enum(["sqft", "sqm"]),
  minBuiltUp: optNum,
  maxBuiltUp: optNum,
  bedroomsMin: optInt,
  bathroomsMin: optInt,
  carParksMin: optInt,
  furnishing: z.enum(["", "any", "unfurnished", "partially", "fully"]),
  otherRequirements: optText,
  clientProfileAnonymised: optText,
  expectedMoveIn: optDate,
  internalNotes: optText,
});

export async function saveRequest(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const raw = Object.fromEntries(
    [
      "id", "intent", "title", "description", "transactionType", "propertyCategory",
      "clientType", "priority", "submissionDeadline", "expiryDate", "countryCode",
      "stateRegion", "city", "district", "preferredAreas", "currency", "budgetMin",
      "budgetMax", "maxMonthlyRent", "leaseTermMonths", "financing", "propertyType",
      "measurementUnit", "minBuiltUp", "maxBuiltUp", "bedroomsMin", "bathroomsMin",
      "carParksMin", "furnishing", "otherRequirements", "clientProfileAnonymised",
      "expectedMoveIn", "internalNotes",
    ].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const back = raw.id ? `/requests/${raw.id}/edit` : "/requests/new";
    redirect(`${back}?error=invalid_fields`);
  }
  const d = parsed.data;

  if (d.budgetMin != null && d.budgetMax != null && d.budgetMin > d.budgetMax) {
    const back = d.id ? `/requests/${d.id}/edit` : "/requests/new";
    redirect(`${back}?error=budget_range`);
  }

  const row = {
    requesting_agent_id: user.id,
    title: d.title,
    description: d.description,
    transaction_type: d.transactionType,
    property_category: d.propertyCategory,
    client_type: d.clientType,
    priority: d.priority,
    submission_deadline: d.submissionDeadline,
    expiry_date: d.expiryDate,
    country_code: d.countryCode,
    state_region: d.stateRegion,
    city: d.city,
    district: d.district,
    preferred_areas: d.preferredAreas
      ? d.preferredAreas.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
    currency: d.currency,
    budget_min: d.budgetMin,
    budget_max: d.budgetMax,
    max_monthly_rent: d.maxMonthlyRent,
    lease_term_months: d.leaseTermMonths,
    financing: d.financing || null,
    property_type: d.propertyType,
    measurement_unit: d.measurementUnit,
    min_built_up: d.minBuiltUp,
    max_built_up: d.maxBuiltUp,
    bedrooms_min: d.bedroomsMin,
    bathrooms_min: d.bathroomsMin,
    car_parks_min: d.carParksMin,
    furnishing: d.furnishing || null,
    other_requirements: d.otherRequirements,
    client_profile_anonymised: d.clientProfileAnonymised,
    expected_move_in: d.expectedMoveIn,
    internal_notes: d.internalNotes,
  };

  let requestId = d.id || null;

  if (requestId) {
    const { data: existing } = await supabase
      .from("property_requests")
      .select("status")
      .eq("id", requestId)
      .single();
    if (!existing) redirect("/requests?error=not_found");
    const newStatus =
      d.intent === "submit"
        ? existing.status === "amendment_required" ? "resubmitted" : "pending_admin_approval"
        : existing.status; // keep draft/amendment_required while saving
    const { error } = await supabase
      .from("property_requests")
      .update({ ...row, status: newStatus })
      .eq("id", requestId);
    if (error) redirect(`/requests/${requestId}/edit?error=save_failed`);
  } else {
    const { data: humanId, error: idErr } = await supabase.rpc("next_human_id", {
      p_prefix: "REQ",
    });
    if (idErr) redirect("/requests/new?error=save_failed");
    const { data: inserted, error } = await supabase
      .from("property_requests")
      .insert({ ...row, human_readable_id: humanId, status: "draft" })
      .select("id")
      .single();
    if (error || !inserted) redirect("/requests/new?error=save_failed");
    requestId = inserted.id;
    if (d.intent === "submit") {
      const { error: subErr } = await supabase
        .from("property_requests")
        .update({ status: "pending_admin_approval" })
        .eq("id", requestId);
      if (subErr) redirect(`/requests/${requestId}?error=save_failed`);
    }
  }

  await logAudit({
    action: d.intent === "submit" ? "request.submitted" : "request.draft_saved",
    entityType: "property_request",
    entityId: requestId!,
  });

  redirect(`/requests/${requestId}${d.intent === "submit" ? "?submitted=1" : ""}`);
}
