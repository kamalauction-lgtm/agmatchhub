"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSubmissionParties } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";

const CATEGORIES = [
  "client_bypass", "agent_bypass", "false_information", "unauthorised_listing",
  "incorrect_price", "property_unavailable", "misleading_images", "fraud_suspicion",
  "confidentiality_breach", "harassment", "commission_dispute", "appointment_dispute",
  "duplicate_listing", "inappropriate_content", "other",
] as const;

export async function reportViolation(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = z
    .object({
      submissionId: z.string().uuid(),
      category: z.enum(CATEGORIES),
      description: z.string().trim().min(10).max(4000),
    })
    .safeParse({
      submissionId: formData.get("submissionId"),
      category: formData.get("category"),
      description: formData.get("description"),
    });
  if (!parsed.success) redirect("/dashboard");
  const d = parsed.data;

  const parties = await getSubmissionParties(d.submissionId);
  if (!parties) redirect("/dashboard");
  const back =
    user.id === parties.supplyAgentId
      ? `/submissions/${d.submissionId}`
      : `/requests/${parties.requestId}/s/${d.submissionId}`;
  const reportedUserId =
    user.id === parties.supplyAgentId ? parties.requestingAgentId : parties.supplyAgentId;

  const { data: humanId, error: idErr } = await supabase.rpc("next_human_id", {
    p_prefix: "RPT",
  });
  if (idErr) redirect(`${back}?error=collab_failed`);

  const { error } = await supabase.from("violation_reports").insert({
    human_readable_id: humanId,
    submission_id: d.submissionId,
    request_id: parties.requestId,
    reporter_id: user.id,
    reported_user_id: reportedUserId,
    category: d.category,
    description: d.description,
  });
  if (error) redirect(`${back}?error=collab_failed`);

  await logAudit({
    action: "violation.reported",
    entityType: "violation_report",
    entityId: humanId as string,
    reason: d.category,
  });

  redirect(`${back}?reported=1`);
}
