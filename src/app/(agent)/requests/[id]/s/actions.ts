"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  requestId: z.string().uuid(),
  submissionId: z.string().uuid(),
  decision: z.enum(["shortlisted", "rejected", "more_information_required", "under_review"]),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

/** RA decisions run through the ra_review_submission DB function, which
 *  verifies request ownership and can only change workflow status (§9). */
export async function reviewSubmission(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = schema.safeParse({
    requestId: formData.get("requestId"),
    submissionId: formData.get("submissionId"),
    decision: formData.get("decision"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) redirect("/requests");
  const { requestId, submissionId, decision, reason } = parsed.data;
  const back = `/requests/${requestId}/s/${submissionId}`;

  if (decision === "rejected" && !reason) {
    redirect(`${back}?error=reason_required`);
  }

  const { error } = await supabase.rpc("ra_review_submission", {
    p_submission_id: submissionId,
    p_new_status: decision,
    p_reason: reason || null,
  });
  if (error) redirect(`${back}?error=save_failed`);

  await logAudit({
    action: `submission.${decision}`,
    entityType: "property_submission",
    entityId: submissionId,
    reason: reason || undefined,
  });

  redirect(`${back}?done=${decision}`);
}
