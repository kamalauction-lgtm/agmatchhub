"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Agent Acquisition Pipeline (screen 2, 00126). Every write goes through the
 * admin's session: RLS requires agent.invite in the prospect's country, and
 * the database refuses a prospect in a country with no retention period set
 * (owner decision 5). Audits never carry the prospect's contact details.
 */

const STAGES = ["new", "contacted", "interested", "invited", "declined", "converted"] as const;
const SOURCES = ["referral", "event", "portal_listing", "social", "inbound", "other"] as const;
const back = (q: string): never => redirect(`/admin/agents/pipeline?${q}`);

const addSchema = z.object({
  countryCode: z.string().regex(/^[A-Z]{2}$/),
  fullName: z.string().trim().min(2).max(120).regex(/^[^<>]*$/),
  phone: z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/).optional().or(z.literal("")),
  email: z.string().trim().toLowerCase().email().max(200).optional().or(z.literal("")),
  agencyName: z.string().trim().max(160).regex(/^[^<>]*$/).optional().or(z.literal("")),
  source: z.enum(SOURCES),
  sourceNote: z.string().trim().max(300).optional().or(z.literal("")),
  purposeNote: z.string().trim().min(3).max(500),
});

export async function addProspect(formData: FormData): Promise<void> {
  const user = await requireCapability("agent.invite");
  const p = addSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!p.success) return back("error=invalid");
  const d = p.data;
  if (!d.phone && !d.email) return back("error=contact_required");
  const supabase = await createClient();
  const { data, error } = await supabase.from("agent_prospects").insert({
    country_code: d.countryCode, full_name: d.fullName, phone: d.phone || null, email: d.email || null,
    agency_name: d.agencyName || null, source: d.source, source_note: d.sourceNote || null,
    purpose_note: d.purposeNote, owner_admin: user.id, created_by: user.id,
    // delete_after is set by the database trigger from the country's retention period.
    delete_after: new Date().toISOString(),
  }).select("id").single();
  if (error || !data) return back(error && /retention_not_set/.test(error.message) ? "error=retention_not_set" : "error=not_permitted");
  await logAudit({ action: "agent_prospect.created", entityType: "agent_prospect", entityId: data.id, next: { country: d.countryCode, source: d.source } });
  revalidatePath("/admin/agents/pipeline");
  back("done=added");
}

const stageSchema = z.object({ prospectId: z.string().uuid(), stage: z.enum(STAGES), contacted: z.string().optional() });

export async function setProspectStage(formData: FormData): Promise<void> {
  await requireCapability("agent.invite");
  const p = stageSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!p.success) return back("error=invalid");
  const { prospectId, stage, contacted } = p.data;
  const supabase = await createClient();
  const { data: before } = await supabase.from("agent_prospects").select("stage").eq("id", prospectId).maybeSingle();
  if (!before) return back("error=not_found");
  const patch: Record<string, unknown> = { stage };
  // A contact resets the retention clock (delete_after follows last activity).
  if (contacted === "1" || stage === "contacted") patch.last_contact_at = new Date().toISOString();
  const { data, error } = await supabase.from("agent_prospects").update(patch).eq("id", prospectId).select("id");
  if (error || !(data ?? []).length) return back("error=not_permitted");
  await logAudit({ action: "agent_prospect.stage", entityType: "agent_prospect", entityId: prospectId, previous: { stage: before.stage }, next: { stage } });
  revalidatePath("/admin/agents/pipeline");
  back("done=stage");
}

export async function deleteProspect(formData: FormData): Promise<void> {
  await requireCapability("agent.invite");
  const id = z.string().uuid().safeParse(formData.get("prospectId"));
  if (!id.success) return back("error=invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.from("agent_prospects").delete().eq("id", id.data).select("id");
  if (error || !(data ?? []).length) back("error=not_permitted");
  await logAudit({ action: "agent_prospect.deleted", entityType: "agent_prospect", entityId: id.data, reason: "deleted by admin" });
  revalidatePath("/admin/agents/pipeline");
  back("done=deleted");
}
