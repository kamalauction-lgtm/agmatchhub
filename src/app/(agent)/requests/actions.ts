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

/** Draft-mode variants: a draft save must (almost) never be rejected. */
const laxNum = z.string().transform((v) => {
  const n = Number(String(v).trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
});
const laxDate = z.string().transform((v) =>
  /^\d{4}-\d{2}-\d{2}$/.test(String(v).trim()) ? String(v).trim() : null,
);

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
  alternativeAreas: optText,
});

const laxInt = laxNum.transform((n) => (n == null ? null : Math.trunc(n)));

/**
 * Draft saves accept whatever the agent has typed so far — a half-finished
 * form must never be rejected and lost. Only submit-for-approval validates
 * strictly.
 */
const draftSchema = schema.extend({
  title: z.string().trim().max(200).transform((v) => v || "Untitled requirement"),
  city: z.string().trim().max(120),
  budgetMin: laxNum,
  budgetMax: laxNum,
  maxMonthlyRent: laxNum,
  minBuiltUp: laxNum,
  maxBuiltUp: laxNum,
  leaseTermMonths: laxInt,
  bedroomsMin: laxInt,
  bathroomsMin: laxInt,
  carParksMin: laxInt,
  submissionDeadline: laxDate,
  expiryDate: laxDate,
  expectedMoveIn: laxDate,
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
      "expectedMoveIn", "internalNotes", "alternativeAreas",
    ].map((k) => [k, String(formData.get(k) ?? "")]),
  );
  const back = raw.id ? `/requests/${raw.id}/edit` : "/requests/new";
  const isDraft = raw.intent !== "submit";

  const parsed = (isDraft ? draftSchema : schema).safeParse(raw);
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))]
      .slice(0, 6)
      .join(",");
    redirect(`${back}?error=invalid_fields&fields=${encodeURIComponent(fields)}`);
  }
  const d = parsed.data;

  if (!isDraft && d.budgetMin != null && d.budgetMax != null && d.budgetMin > d.budgetMax) {
    redirect(`${back}?error=budget_range&fields=budgetMin,budgetMax`);
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
    alternative_areas: d.alternativeAreas
      ? d.alternativeAreas.split(",").map((s) => s.trim()).filter(Boolean)
      : [],
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
    if (error) {
      console.error("[request.save] update failed:", error.code, error.message);
      redirect(`/requests/${requestId}/edit?error=save_failed&code=${error.code ?? "unknown"}`);
    }
  } else {
    const { data: humanId, error: idErr } = await supabase.rpc("next_human_id", {
      p_prefix: "REQ",
    });
    if (idErr) {
      console.error("[request.save] id generation failed:", idErr.code, idErr.message);
      redirect(`${back}?error=save_failed&code=${idErr.code ?? "id"}`);
    }
    const { data: inserted, error } = await supabase
      .from("property_requests")
      .insert({ ...row, human_readable_id: humanId, status: "draft" })
      .select("id")
      .single();
    if (error || !inserted) {
      console.error("[request.save] insert failed:", error?.code, error?.message);
      redirect(`${back}?error=save_failed&code=${error?.code ?? "insert"}`);
    }
    requestId = inserted.id;
    if (d.intent === "submit") {
      const { error: subErr } = await supabase
        .from("property_requests")
        .update({ status: "pending_admin_approval" })
        .eq("id", requestId);
      // Draft is already safely stored at this point; worst case the agent
      // submits again from the detail page.
      if (subErr) redirect(`/requests/${requestId}?error=save_failed&code=${subErr.code ?? "submit"}`);
    }
  }

  // Confidential RA notes live in the private companion table (§13),
  // invisible to Supply Agents who can read the request row.
  await supabase
    .from("property_request_private")
    .upsert({ request_id: requestId!, internal_notes: d.internalNotes },
      { onConflict: "request_id" });

  await logAudit({
    action: d.intent === "submit" ? "request.submitted" : "request.draft_saved",
    entityType: "property_request",
    entityId: requestId!,
  });

  redirect(`/requests/${requestId}${d.intent === "submit" ? "?submitted=1" : ""}`);
}
