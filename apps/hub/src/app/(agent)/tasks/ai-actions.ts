"use server";

import { z } from "zod";
import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/authz";
import { createClient } from "@/lib/supabase/server";
import { getDashboard } from "@/lib/dashboard/brief";
import { proposeTasks, type TaskProposal } from "@/lib/ai/tasks";
import { ruleTasksForLead, ruleTasksForBrief } from "@/lib/ai/task-rules";
import { firstNameOf } from "@/lib/ai/secretary-rules";
import { briefDate } from "@/lib/ai/brief";

/**
 * Propose tasks — from one lead's enquiry, or from today's brief. Nothing is
 * saved here: the agent ticks what they want and `createTasksBulk` saves it.
 */
export async function suggestTasks(input: { leadId?: string }): Promise<TaskProposal & { leadId?: string }> {
  const user = await requireUser();
  const locale = await getLocale();
  const today = briefDate();
  const supabase = await createClient();

  if (input.leadId) {
    if (!z.string().uuid().safeParse(input.leadId).success) throw new Error("bad lead id");
    const { data: lead } = await supabase
      .from("leads")
      .select("id, message, inquiry_type, contacts (full_name), listings (title)")
      .eq("id", input.leadId)
      .maybeSingle();
    if (!lead) throw new Error("lead not found");
    const contact = (Array.isArray(lead.contacts) ? lead.contacts[0] : lead.contacts) as { full_name: string } | null;
    const listing = (Array.isArray(lead.listings) ? lead.listings[0] : lead.listings) as { title: string } | null;
    const firstName = firstNameOf(contact?.full_name);
    const floor = ruleTasksForLead({ locale, firstName, inquiryType: lead.inquiry_type });
    const text = `Enquiry (${lead.inquiry_type}) from ${firstName ?? "an enquirer"} about "${listing?.title ?? ""}": ${lead.message ?? ""}`;
    const res = await proposeTasks({ userId: user.id, locale, source: "lead", text, today, floor, refType: "lead", refId: lead.id });
    return { ...res, leadId: lead.id };
  }

  // From the brief: the ranked actions, each as a task due this afternoon.
  const { brief } = await getDashboard({ client: supabase, agentId: user.id });
  const t = await getTranslations("dashboard");
  const actions = brief.actions.map((a) => ({ label: t(`brief.actions.${a.key}`, { count: a.count }), href: a.href }));
  const dueAt = new Date(`${today}T17:00:00+08:00`).toISOString();
  const floor = ruleTasksForBrief(actions, dueAt);
  if (!floor.length) return { tasks: [], source: "rules" };
  const text = actions.map((a, i) => `${i + 1}. ${a.label}`).join("\n");
  return proposeTasks({ userId: user.id, locale, source: "brief", text, today, floor, refType: "brief" });
}
