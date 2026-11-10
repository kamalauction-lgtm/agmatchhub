"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { notify } from "@/lib/notifications";

/**
 * Hand a prepared batch to its agent (00107). The database checks
 * listing.import_assisted for the agent's country, stamps handed_over_at and
 * audits it with the admin as actor; the agent is then told the batch is
 * waiting for them to review and commit. Committing stays the agent's act.
 */
export async function handoverBatch(formData: FormData): Promise<void> {
  await requireCapability("listing.import_assisted");
  const parsed = z.string().uuid().safeParse(formData.get("batchId"));
  if (!parsed.success) redirect("/admin/imports?error=invalid");
  const batchId = parsed.data;

  const supabase = await createClient();
  const { data: agentId, error } = await supabase.rpc("admin_import_batch_handover", { p_batch: batchId });
  if (error || !agentId) redirect(`/admin/imports/${batchId}?error=not_permitted`);

  await notify({
    userId: agentId as string,
    kind: "listing_import.prepared",
    payload: { batch: batchId },
    href: `/listings/import/${batchId}`,
  });

  revalidatePath(`/admin/imports/${batchId}`);
  redirect(`/admin/imports/${batchId}?done=handed_over`);
}
