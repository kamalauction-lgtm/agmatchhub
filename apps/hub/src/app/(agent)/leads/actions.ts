"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { logAudit } from "@/lib/audit";

/**
 * Lead workflow actions. RLS already scopes every row to the assigned agent,
 * and the guard trigger (00033) keeps assignment, sync state and an
 * already-set first_responded_at out of reach — these actions are the thin
 * agent-facing layer on top of that.
 */

// The statuses an agent may set by hand. 'new' is where leads arrive and
// 'spam' is a deliberate act; both included. GHL-derived stages come later
// via the sync drainer, not by hand.
const AGENT_STATUSES = [
  "new",
  "contact_attempted",
  "contacted",
  "qualified",
  "property_matched",
  "viewing_proposed",
  "viewing_confirmed",
  "viewed",
  "negotiating",
  "booking",
  "financing",
  "closed_won",
  "closed_lost",
  "nurture",
  "spam",
] as const;

const statusSchema = z.object({
  leadId: z.string().uuid(),
  status: z.enum(AGENT_STATUSES),
});

export async function updateLeadStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = statusSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/leads?error=invalid");

  const { leadId, status } = parsed.data;
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, status, first_responded_at")
    .eq("id", leadId)
    .single();
  if (!lead) redirect("/leads?error=not_found");

  // Moving a 'new' lead anywhere is de facto the first response; stamp the
  // SLA on the same update so it can never be forgotten.
  const patch: Record<string, unknown> = { status };
  if (!lead.first_responded_at && status !== "new") {
    patch.first_responded_at = new Date().toISOString();
  }

  const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
  if (error) redirect("/leads?error=update_failed");

  await supabase.from("lead_events").insert({
    lead_id: leadId,
    kind: "status.changed",
    detail: { from: lead.status, to: status },
    actor_id: user.id,
  });

  await logAudit({
    action: "lead.status_changed",
    entityType: "lead",
    entityId: leadId,
    next: { from: lead.status, to: status },
  });

  revalidatePath("/leads");
  redirect("/leads?updated=1");
}

const respondSchema = z.object({ leadId: z.string().uuid() });

/**
 * "I've contacted the buyer" — stops the SLA clock without forcing a stage
 * decision. Status moves new → contacted only if it was still new.
 */
export async function markLeadResponded(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = respondSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect("/leads?error=invalid");

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, status, first_responded_at")
    .eq("id", parsed.data.leadId)
    .single();
  if (!lead) redirect("/leads?error=not_found");

  if (!lead.first_responded_at) {
    const { error } = await supabase
      .from("leads")
      .update({
        first_responded_at: new Date().toISOString(),
        status: lead.status === "new" ? "contacted" : lead.status,
      })
      .eq("id", lead.id);
    if (error) redirect("/leads?error=update_failed");

    await supabase.from("lead_events").insert({
      lead_id: lead.id,
      kind: "lead.responded",
      detail: {},
      actor_id: user.id,
    });
    await logAudit({ action: "lead.responded", entityType: "lead", entityId: lead.id });
  }

  revalidatePath("/leads");
  redirect("/leads?updated=1");
}
