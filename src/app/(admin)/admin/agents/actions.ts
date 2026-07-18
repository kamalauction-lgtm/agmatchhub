"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const decisionSchema = z.object({
  userId: z.string().uuid(),
  decision: z.enum(["approve", "reject", "request_info"]),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

const STATUS_BY_DECISION = {
  approve: "verified",
  reject: "rejected",
  request_info: "additional_information_required",
} as const;

const ACTION_BY_DECISION = {
  approve: "approved",
  reject: "rejected",
  request_info: "info_requested",
} as const;

export async function reviewSocialLink(formData: FormData) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  const parsed = z
    .object({
      linkId: z.string().uuid(),
      userId: z.string().uuid(),
      decision: z.enum(["verified", "rejected", "hidden"]),
    })
    .safeParse({
      linkId: formData.get("linkId"),
      userId: formData.get("userId"),
      decision: formData.get("decision"),
    });
  if (!parsed.success) redirect("/admin/agents");
  const d = parsed.data;

  const { error } = await supabase
    .from("agent_social_links")
    .update({ verification_status: d.decision })
    .eq("id", d.linkId);
  if (error) redirect(`/admin/agents/${d.userId}?error=save_failed`);

  await logAudit({
    action: `trust_profile.link_${d.decision}`,
    entityType: "agent_social_link",
    entityId: d.linkId,
  });
  redirect(`/admin/agents/${d.userId}?done=link_${d.decision}`);
}

export async function reviewAgent(formData: FormData) {
  // Admin gate: RLS policies additionally enforce is_platform_admin() on
  // every write below, so a non-admin session fails at the database too.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  const parsed = decisionSchema.safeParse({
    userId: formData.get("userId"),
    decision: formData.get("decision"),
    notes: formData.get("notes"),
  });
  if (!parsed.success) redirect("/admin/agents?error=invalid");
  const { userId, decision, notes } = parsed.data;

  if (decision !== "approve" && !notes) {
    redirect(`/admin/agents/${userId}?error=notes_required`);
  }

  const { data: target } = await supabase
    .from("profiles")
    .select("agent_status")
    .eq("id", userId)
    .single();
  if (!target) redirect("/admin/agents?error=not_found");

  const newStatus = STATUS_BY_DECISION[decision];

  const { error: statusErr } = await supabase
    .from("profiles")
    .update({ agent_status: newStatus })
    .eq("id", userId);
  if (statusErr) redirect(`/admin/agents/${userId}?error=save_failed`);

  await supabase
    .from("agent_profiles")
    .update({
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
    })
    .eq("user_id", userId);

  await supabase.from("agent_verifications").insert({
    user_id: userId,
    action: ACTION_BY_DECISION[decision],
    notes: notes || null,
    acted_by: user.id,
  });

  await logAudit({
    action: `agent.${ACTION_BY_DECISION[decision]}`,
    entityType: "agent_profile",
    entityId: userId,
    previous: { agent_status: target.agent_status },
    next: { agent_status: newStatus },
    reason: notes || undefined,
  });

  redirect(`/admin/agents/${userId}?done=${decision}`);
}
