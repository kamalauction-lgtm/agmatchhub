"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

/**
 * Closing Checklist: one row per deal, owned by the agent (RLS), ticking the
 * steps the catalogue (`closing_steps`) lists for that country and
 * transaction. Creating and completing a checklist are audited; a tick is not.
 */
const PATH = "/ai/closing";

export async function createChecklist(formData: FormData): Promise<void> {
  const user = await requireUser();
  const d = z.object({
    label: z.string().trim().min(1).max(120),
    countryCode: z.string().length(2),
    transactionType: z.enum(["sale", "rent"]),
    leadId: z.string().uuid().optional().or(z.literal("")),
  }).safeParse(Object.fromEntries(formData.entries()));
  if (!d.success) redirect(`${PATH}?error=invalid`);
  const supabase = await createClient();
  const { data, error } = await supabase.from("closing_checklists").insert({
    agent_id: user.id, label: d.data.label, country_code: d.data.countryCode, transaction_type: d.data.transactionType, lead_id: d.data.leadId || null,
  }).select("id").single();
  if (error || !data) redirect(`${PATH}?error=save_failed`);
  await logAudit({ action: "closing.checklist_created", entityType: "closing_checklist", entityId: data.id, next: { country: d.data.countryCode, transaction: d.data.transactionType, lead_id: d.data.leadId || null } });
  revalidatePath(PATH);
  redirect(`${PATH}?c=${data.id}`);
}

export async function toggleStep(formData: FormData): Promise<void> {
  const user = await requireUser();
  const d = z.object({ checklistId: z.string().uuid(), stepId: z.string().uuid(), done: z.enum(["1", "0"]) }).safeParse(Object.fromEntries(formData.entries()));
  if (!d.success) redirect(`${PATH}?error=invalid`);
  const supabase = await createClient();
  const { data: row } = await supabase.from("closing_checklists").select("done_step_ids").eq("id", d.data.checklistId).eq("agent_id", user.id).maybeSingle();
  if (!row) redirect(`${PATH}?error=not_found`);
  const set = new Set<string>(row.done_step_ids ?? []);
  if (d.data.done === "1") set.add(d.data.stepId); else set.delete(d.data.stepId);
  await supabase.from("closing_checklists").update({ done_step_ids: [...set] }).eq("id", d.data.checklistId);
  revalidatePath(PATH);
  redirect(`${PATH}?c=${d.data.checklistId}`);
}

export async function setChecklistStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const d = z.object({ checklistId: z.string().uuid(), status: z.enum(["open", "completed", "archived"]), notes: z.string().trim().max(2000).optional() }).safeParse(Object.fromEntries(formData.entries()));
  if (!d.success) redirect(`${PATH}?error=invalid`);
  const supabase = await createClient();
  const { error } = await supabase.from("closing_checklists").update({ status: d.data.status, ...(d.data.notes !== undefined ? { notes: d.data.notes || null } : {}) }).eq("id", d.data.checklistId).eq("agent_id", user.id);
  if (error) redirect(`${PATH}?error=save_failed`);
  if (d.data.status !== "open") await logAudit({ action: `closing.checklist_${d.data.status}`, entityType: "closing_checklist", entityId: d.data.checklistId });
  revalidatePath(PATH);
  redirect(d.data.status === "archived" ? PATH : `${PATH}?c=${d.data.checklistId}`);
}
