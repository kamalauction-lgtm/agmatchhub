"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { notify } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";

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

const bulkStatus = z.object({
  batchId: z.string().uuid(),
  status: z.enum(["skipped", "restore"]),
});

/**
 * Batch Review bulk action (P1-a, screen 6): skip the selected items, or put
 * skipped ones back. Runs with the admin's session, so the 00107 write policy
 * (listing.import_assisted for the agent's country, assisted batches only)
 * decides; items already imported are never touched. Restored items go back
 * to `ready` when they carry extracted data, otherwise to `found`. Audited.
 */
export async function bulkItemStatus(formData: FormData): Promise<void> {
  await requireCapability("listing.import_assisted");
  const p = bulkStatus.safeParse({ batchId: formData.get("batchId"), status: formData.get("status") });
  if (!p.success) redirect("/admin/imports?error=invalid");
  const { batchId, status } = p.data;
  const ids = formData.getAll("itemIds").map(String).filter((x) => z.string().uuid().safeParse(x).success).slice(0, 200);
  if (!ids.length) redirect(`/admin/imports/${batchId}?error=nothing_selected`);

  const supabase = await createClient();
  const { data: canWrite } = await supabase.rpc("admin_can_import_batch", { p_batch: batchId });
  if (!canWrite) redirect(`/admin/imports/${batchId}?error=not_permitted`);

  const { data: items } = await supabase
    .from("import_items").select("id, status, extracted").eq("batch_id", batchId).in("id", ids);
  let changed = 0;
  for (const it of items ?? []) {
    if (it.status === "imported") continue;
    const next = status === "skipped"
      ? (it.status === "skipped" ? null : "skipped")
      : (it.status !== "skipped" ? null : (it.extracted && Object.keys(it.extracted as object).length ? "ready" : "found"));
    if (!next) continue;
    const { error } = await supabase.from("import_items").update({ status: next }).eq("id", it.id).eq("batch_id", batchId);
    if (!error) changed++;
  }
  await logAudit({
    action: "listing_import.assisted_bulk_status",
    entityType: "import_batch",
    entityId: batchId,
    next: { status, selected: ids.length, changed },
  });
  revalidatePath(`/admin/imports/${batchId}`);
  redirect(`/admin/imports/${batchId}?done=bulk_${status}&n=${changed}`);
}
