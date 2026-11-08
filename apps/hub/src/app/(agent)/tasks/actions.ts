"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Tasks and lead viewings. Every write is the agent's own row (RLS), and the
 * one thing that touches another record — proposing a viewing moves the lead
 * to `viewing_confirmed` — is audited and put on the lead's timeline.
 */

const KINDS = ["call", "message", "viewing", "document", "follow_up", "other"] as const;

// A declared function, so TypeScript narrows after `if (!ok) back("…")`.
function back(q = ""): never {
  redirect(`/tasks${q}`);
}

const createSchema = z.object({
  title: z.string().trim().min(2).max(160),
  kind: z.enum(KINDS).default("other"),
  dueAt: z.string().optional().or(z.literal("")),
  leadId: z.string().uuid().optional().or(z.literal("")),
  listingId: z.string().uuid().optional().or(z.literal("")),
  source: z.enum(["manual", "ai_manager", "secretary", "task_extract"]).default("manual"),
  notes: z.string().max(1000).optional().or(z.literal("")),
});

export async function createTask(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) back("?error=invalid");
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("agent_tasks").insert({
    agent_id: user.id, title: d.title, kind: d.kind, source: d.source,
    due_at: d.dueAt ? new Date(d.dueAt).toISOString() : null,
    lead_id: d.leadId || null, listing_id: d.listingId || null, notes: d.notes || null,
  });
  if (error) { console.error("createTask", error.message); back("?error=save_failed"); }
  revalidatePath("/tasks");
  back(d.leadId ? `?lead=${d.leadId}&notice=created` : "?notice=created");
}

/** The AI's proposals the agent ticked, as one JSON field. */
const bulkSchema = z.object({
  source: z.enum(["ai_manager", "secretary", "task_extract"]),
  leadId: z.string().uuid().optional().or(z.literal("")),
  tasks: z.string().transform((s) => JSON.parse(s) as unknown).pipe(
    z.array(z.object({ title: z.string().trim().min(2).max(160), kind: z.enum(KINDS), dueAt: z.string().nullable() })).min(1).max(5),
  ),
});

export async function createTasksBulk(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = bulkSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) back("?error=invalid");
  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("agent_tasks").insert(
    d.tasks.map((t) => ({
      agent_id: user.id, title: t.title, kind: t.kind, source: d.source,
      due_at: t.dueAt && !Number.isNaN(Date.parse(t.dueAt)) ? new Date(t.dueAt).toISOString() : null,
      lead_id: d.leadId || null,
    })),
  );
  if (error) { console.error("createTasksBulk", error.message); back("?error=save_failed"); }
  revalidatePath("/tasks");
  back(d.leadId ? `?lead=${d.leadId}&notice=created` : "?notice=created");
}

const statusSchema = z.object({ taskId: z.string().uuid(), status: z.enum(["done", "dismissed", "open"]) });

export async function setTaskStatus(formData: FormData): Promise<void> {
  await requireUser();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) back("?error=invalid");
  const { taskId, status } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("agent_tasks")
    .update({ status, done_at: status === "done" ? new Date().toISOString() : null })
    .eq("id", taskId);
  if (error) back("?error=save_failed");
  revalidatePath("/tasks");
  revalidatePath("/dashboard");
  back();
}

/* ---------------------------------------------------------------------------
 * Viewings for marketplace leads
 * ------------------------------------------------------------------------ */

const viewingSchema = z.object({
  leadId: z.string().uuid(),
  proposedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  proposedTime: z.string().regex(/^\d{2}:\d{2}$/).optional().or(z.literal("")),
  viewingType: z.enum(["physical", "virtual"]).default("physical"),
  meetingPoint: z.string().max(200).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

export async function proposeLeadViewing(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = viewingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) back("?error=invalid");
  const d = parsed.data;
  const supabase = await createClient();

  const { data: lead } = await supabase.from("leads").select("id, status, listing_id, first_responded_at").eq("id", d.leadId).maybeSingle();
  if (!lead) back("?error=not_found");

  const { data: humanId } = await supabase.rpc("next_human_id", { p_prefix: "VIEW" });
  const { error } = await supabase.from("viewing_appointments").insert({
    human_readable_id: humanId,
    lead_id: lead.id,
    listing_id: lead.listing_id,
    proposed_by: user.id,
    proposed_date: d.proposedDate,
    proposed_time: d.proposedTime || null,
    viewing_type: d.viewingType,
    meeting_point: d.meetingPoint || null,
    notes: d.notes || null,
    // The agent arranged it with the client directly; there is no second
    // party in the system to confirm, so it is confirmed on creation.
    status: "confirmed",
  });
  if (error) { console.error("proposeLeadViewing", error.message); back(`?lead=${d.leadId}&error=save_failed`); }

  // A booked viewing is progress on the lead, and a first response if none yet.
  const patch: Record<string, unknown> = { status: "viewing_confirmed" };
  if (!lead.first_responded_at) patch.first_responded_at = new Date().toISOString();
  await supabase.from("leads").update(patch).eq("id", lead.id);
  await supabase.from("lead_events").insert({ lead_id: lead.id, kind: "status.changed", detail: { from: lead.status, to: "viewing_confirmed", viewing: humanId }, actor_id: user.id });
  await logAudit({ action: "lead.viewing_booked", entityType: "lead", entityId: lead.id, next: { viewing: humanId, date: d.proposedDate } });

  revalidatePath("/tasks");
  revalidatePath("/leads");
  back(`?lead=${d.leadId}&notice=viewing`);
}

const viewingStatusSchema = z.object({ viewingId: z.string().uuid(), status: z.enum(["completed", "cancelled"]) });

export async function setLeadViewingStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = viewingStatusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) back("?error=invalid");
  const supabase = await createClient();
  const { error } = await supabase
    .from("viewing_appointments")
    .update({ status: parsed.data.status, responded_by: user.id })
    .eq("id", parsed.data.viewingId)
    .not("lead_id", "is", null);
  if (error) back("?error=save_failed");
  revalidatePath("/tasks");
  back();
}
