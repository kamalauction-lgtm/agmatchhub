"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { commitReadyItems } from "@/lib/import/commit";

/**
 * Turn reviewed import items into NORMAL listings.
 *
 * This is the whole point of the module, and the part where the architecture
 * rule bites: an item does not become an "imported listing". It becomes a row
 * in `properties` and a row in `listings`, written the same way the creation
 * wizard writes them, with `creation_source = 'import'` recorded as inert
 * provenance (00056) and `import_items.listing_id` pointing at the result.
 *
 * After this runs the item is history. The listing is just a listing.
 */

const schema = z.object({
  batchId: z.string().uuid(),
  /** The versioned declaration the agent accepted. Required — see below. */
  declarationVersionId: z.string().uuid(),
});

export async function importReadyItems(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const b = String(formData.get("batchId") ?? "");
    redirect(`/listings/import/${b}?error=authority_required`);
  }
  const { batchId, declarationVersionId } = parsed.data;
  const supabase = await createClient();

  const { data: batch } = await supabase
    .from("import_batches")
    .select("id, agent_id, source_portal, source_kind, consent_record_id")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) redirect("/listings/import?error=not_found");
  // D15 (00107): the batch's owner commits it, nobody else. An admin can see
  // an agent's batch, and before this check committing it would have created
  // the listings — and recorded the authority declaration — as the admin.
  if (batch.agent_id !== user.id) redirect(`/listings/import/${batchId}?error=not_owner`);

  /* --- authority declaration ------------------------------------------------
   * Recorded through the existing versioned framework, not as a boolean on the
   * batch. The wording an agent accepted has to be recoverable after that
   * wording changes, which a checkbox cannot do.
   */
  const { data: version } = await supabase
    .from("declaration_versions")
    .select("id, declaration_id, body, locale")
    .eq("id", declarationVersionId)
    .maybeSingle();
  if (!version) redirect(`/listings/import/${batchId}?error=authority_required`);

  let consentId = batch.consent_record_id as string | null;
  if (!consentId) {
    const { data: consent, error: consentErr } = await supabase
      .from("consent_records")
      .insert({
        user_id: user.id,
        declaration_id: version.declaration_id,
        declaration_version_id: version.id,
        accepted_text: version.body,       // the exact words, frozen
        language: version.locale,
        import_batch_ref: batchId,
        status: "accepted",
      })
      .select("id")
      .single();
    // Checked, not fired and forgotten: an RLS refusal here has looked like
    // success twice before in this codebase (00034, 00037).
    if (consentErr || !consent) {
      console.error("consent record failed:", consentErr?.message);
      redirect(`/listings/import/${batchId}?error=save_failed`);
    }
    consentId = consent.id;
    await supabase.from("import_batches").update({ consent_record_id: consentId }).eq("id", batchId);
  }

  /* --- the items: shared with an admin's on-behalf commit (00133) --------- */
  const { imported, failed } = await commitReadyItems(supabase, {
    batchId, agentId: user.id, createdBy: user.id, sourcePortal: batch.source_portal ?? null, status: "draft",
  });

  await logAudit({
    action: "listing_import.committed",
    entityType: "import_batch",
    entityId: batchId,
    next: { imported, failed, consent_record_id: consentId },
  });

  revalidatePath("/listings");
  revalidatePath("/listings/import");
  redirect(`/listings?imported=${imported}`);
}
