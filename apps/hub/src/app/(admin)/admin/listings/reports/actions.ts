"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";

/**
 * A moderator closes a buyer report (D9, 00120): dismissed (nothing wrong) or
 * actioned (the listing was dealt with — reject or request a change through
 * normal moderation). admin_decide_report checks listing.moderate in the
 * listing's country and audits the decision.
 */
const schema = z.object({
  reportId: z.string().uuid(),
  outcome: z.enum(["dismissed", "actioned"]),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function decideReport(formData: FormData): Promise<void> {
  await requireCapability("listing.moderate");
  const p = schema.safeParse({ reportId: formData.get("reportId"), outcome: formData.get("outcome"), note: formData.get("note") ?? "" });
  if (!p.success) redirect("/admin/listings/reports?error=invalid");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_decide_report", { p_report: p.data.reportId, p_outcome: p.data.outcome, p_note: p.data.note || null });
  const r = data as { ok?: boolean; error?: string } | null;
  if (error || !r?.ok) redirect(`/admin/listings/reports?error=${r?.error ?? "failed"}`);
  revalidatePath("/admin/listings/reports");
  redirect(`/admin/listings/reports?done=${p.data.outcome}`);
}
