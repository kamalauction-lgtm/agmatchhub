"use server";
import { commitReadyItems } from "@/lib/import/commit";
import { createServiceClient } from "@/lib/supabase/service";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/authz";
import { notify } from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { asMarketCountry, isTypeAllowed } from "@/lib/listings/vocabulary";

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
  if (error && /handover_lock/.test(error.message)) redirect(`/admin/imports/${batchId}?error=agent_in_control`);
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
  const { data: state } = await supabase.from("import_batches").select("agent_review_state").eq("id", batchId).maybeSingle();
  if (state?.agent_review_state === "complete") redirect(`/admin/imports/${batchId}?error=agent_in_control`);

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

const bulkFields = z.object({
  batchId: z.string().uuid(),
  setPropertyType: z.string().trim().max(30).optional().or(z.literal("")),
  setListingType: z.enum(["sale", "rent", ""]).optional(),
});

/**
 * Batch Review inline bulk editing (P1-c, screen 6): set the property type
 * and/or listing type on many selected items at once. Same write path as the
 * single-item edit: the admin's session under the 00107 policy (and the 00119
 * lock once the agent is in control); the value lands in each item's
 * `overrides`, so the agent sees it as the team's change, never mixed into
 * what the source said. The property type must be one the agent's market
 * offers. Items already imported or skipped are left alone; readiness is
 * re-checked exactly as for a single edit. Audited once for the batch.
 */
export async function bulkItemFields(formData: FormData): Promise<void> {
  await requireCapability("listing.import_assisted");
  const p = bulkFields.safeParse({
    batchId: formData.get("batchId"),
    setPropertyType: formData.get("setPropertyType") ?? "",
    setListingType: formData.get("setListingType") ?? "",
  });
  if (!p.success) redirect("/admin/imports?error=invalid");
  const { batchId, setPropertyType, setListingType } = p.data;
  const ids = formData.getAll("itemIds").map(String).filter((x) => z.string().uuid().safeParse(x).success).slice(0, 200);
  if (!ids.length) redirect(`/admin/imports/${batchId}?error=nothing_selected`);
  const patch: Record<string, string> = {};
  if (setPropertyType) patch.propertyType = setPropertyType;
  if (setListingType) patch.listingType = setListingType;
  if (!Object.keys(patch).length) redirect(`/admin/imports/${batchId}?error=nothing_to_set`);

  const supabase = await createClient();
  const { data: canWrite } = await supabase.rpc("admin_can_import_batch", { p_batch: batchId });
  if (!canWrite) redirect(`/admin/imports/${batchId}?error=not_permitted`);
  const { data: batch } = await supabase
    .from("import_batches").select("agent_review_state, profiles(country_code)").eq("id", batchId).maybeSingle();
  if (batch?.agent_review_state === "complete") redirect(`/admin/imports/${batchId}?error=agent_in_control`);
  const prof = (Array.isArray(batch?.profiles) ? batch?.profiles[0] : batch?.profiles) as { country_code?: string } | null;
  const market = asMarketCountry(prof?.country_code);
  if (patch.propertyType && (!market || !isTypeAllowed(market, patch.propertyType))) {
    redirect(`/admin/imports/${batchId}?error=type_not_in_market`);
  }

  const { data: items } = await supabase
    .from("import_items").select("id, status, extracted, overrides").eq("batch_id", batchId).in("id", ids);
  let changed = 0;
  for (const it of items ?? []) {
    if (it.status === "imported" || it.status === "skipped") continue;
    const overrides = { ...((it.overrides as Record<string, unknown>) ?? {}), ...patch };
    const merged = { ...((it.extracted as Record<string, unknown>) ?? {}), ...overrides };
    const update: Record<string, unknown> = { overrides };
    if (it.status === "ready" || it.status === "needs_review") {
      const stillMissing = ["title", "price", "propertyType"].filter((f) => merged[f] == null || merged[f] === "");
      update.status = stillMissing.length ? "needs_review" : "ready";
      update.warnings = stillMissing.map((f) => `${f}_missing`);
    }
    const { error } = await supabase.from("import_items").update(update).eq("id", it.id).eq("batch_id", batchId);
    if (!error) changed++;
  }
  await logAudit({
    action: "listing_import.assisted_bulk_edit",
    entityType: "import_batch",
    entityId: batchId,
    next: { fields: patch, selected: ids.length, changed },
  });
  revalidatePath(`/admin/imports/${batchId}`);
  redirect(`/admin/imports/${batchId}?done=bulk_edit&n=${changed}`);
}

/**
 * Publish an agent's prepared batch on their behalf (00133, owner decision
 * 19 Nov 2026; lifts D-2). Allowed only while the agent's latest onboarding
 * consent includes publish_on_behalf: admin_import_batch_commit_authorise
 * checks that, the country scope and the handover lock, records the consent
 * and the admin, audits and notifies the agent. The listings are then written
 * for the agent with the service role, straight into the moderation queue
 * (pending_review), where this admin may approve them (00133).
 */
export async function commitBatchForAgent(formData: FormData): Promise<void> {
  await requireCapability("listing.import_assisted");
  const batchId = String(formData.get("batchId") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(batchId)) redirect("/admin/imports?error=not_found");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_import_batch_commit_authorise", { p_batch: batchId });
  const r = data as { ok?: boolean; error?: string; agent?: string } | null;
  if (error || !r?.ok || !r.agent) redirect(`/admin/imports/${batchId}?error=${r?.error ?? "save_failed"}`);
  const { data: { user } } = await supabase.auth.getUser();
  const svc = createServiceClient();
  const { data: batch } = await svc.from("import_batches").select("source_portal").eq("id", batchId).maybeSingle();
  const { imported, failed } = await commitReadyItems(svc, {
    batchId, agentId: r.agent, createdBy: user!.id, sourcePortal: batch?.source_portal ?? null, status: "pending_review",
  });
  await logAudit({
    action: "listing_import.committed",
    entityType: "import_batch",
    entityId: batchId,
    next: { imported, failed, on_behalf: true, agent_id: r.agent },
  });
  await notify({ userId: r.agent, kind: "listing_import.committed_on_behalf", payload: { ref: imported }, href: "/listings", inApp: false });
  revalidatePath(`/admin/imports/${batchId}`);
  revalidatePath("/admin/listings");
  redirect(`/admin/imports/${batchId}?done=committed&n=${imported}`);
}
