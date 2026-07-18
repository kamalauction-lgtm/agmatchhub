"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export async function updateReport(formData: FormData) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/dashboard");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const parsed = z
    .object({
      reportId: z.string().uuid(),
      status: z.enum(["under_review", "additional_evidence_required", "user_contacted",
        "account_restricted", "resolved", "rejected", "escalated", "archived"]),
      resolution: z.string().trim().max(2000),
      internalNotes: z.string().trim().max(4000),
    })
    .safeParse({
      reportId: formData.get("reportId"),
      status: formData.get("status"),
      resolution: String(formData.get("resolution") ?? ""),
      internalNotes: String(formData.get("internalNotes") ?? ""),
    });
  if (!parsed.success) redirect("/admin/reports?error=invalid");
  const d = parsed.data;

  const { data: before } = await supabase
    .from("violation_reports")
    .select("status")
    .eq("id", d.reportId)
    .single();

  const { error } = await supabase
    .from("violation_reports")
    .update({ status: d.status, resolution: d.resolution || null })
    .eq("id", d.reportId);
  if (error) redirect(`/admin/reports/${d.reportId}?error=save_failed`);

  await supabase.from("violation_report_admin").upsert({
    report_id: d.reportId,
    assigned_admin: user?.id ?? null,
    internal_notes: d.internalNotes || null,
  });

  await logAudit({
    action: "violation.status_changed",
    entityType: "violation_report",
    entityId: d.reportId,
    previous: { status: before?.status },
    next: { status: d.status },
    reason: d.resolution || undefined,
  });

  redirect(`/admin/reports/${d.reportId}?saved=1`);
}
