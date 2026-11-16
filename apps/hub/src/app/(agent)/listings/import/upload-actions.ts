"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { createImportBatch, forAgentFrom, importBase } from "@/lib/import/batches";
import { logAudit } from "@/lib/audit";
import { sanitiseText } from "@/lib/import/safe-fetch";
import {
  readSpreadsheet, detectColumns, rowToDraft, SpreadsheetError,
} from "@/lib/import/spreadsheet";

/**
 * "Here is my spreadsheet."
 *
 * The other route into this module fetches a portal page. This one reads a
 * file the agent already has, which for most agents is the honest answer to
 * "where are your listings" — an Excel sheet, not a portal profile.
 *
 * It creates the same batch and the same items as the portal route, so from
 * the review screen onwards there is one flow and one set of rules. Nothing
 * here is a separate kind of import.
 */

const MAX_UPLOAD_BYTES = 5_000_000;
/** One upload cannot become a thousand listings by accident. */
const MAX_ITEMS = 500;

export async function uploadSpreadsheet(formData: FormData): Promise<void> {
  const user = await requireUser();
  // An admin preparing a batch for an agent (00107) posts forAgentId.
  const forAgentId = forAgentFrom(formData);
  if (forAgentId === "invalid") redirect("/admin/imports?error=invalid");
  const base = importBase(forAgentId);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirect(`${base}?error=empty_file`);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    redirect(`${base}?error=too_large`);
  }

  const supabase = await createClient();
  let grid: string[][];
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    grid = await readSpreadsheet(file.name, bytes);
  } catch (e) {
    const reason = e instanceof SpreadsheetError ? e.reason : "corrupt";
    redirect(`${base}?error=${reason}`);
  }

  const { headerRow, map, headers } = detectColumns(grid);

  /* A file we cannot read the columns of is not a file to guess at. The agent
   * is told which headers were found and what is needed, and given a template
   * — that is recoverable. Importing rows under assumed column meanings is
   * not: the prices would be silently wrong. */
  if (headerRow < 0 || map.title === undefined || map.price === undefined) {
    const found = headers
      .filter(Boolean).slice(0, 12)
      .map((h) => sanitiseText(h, 40))
      .filter(Boolean).join(", ");
    const failed = await createImportBatch(supabase, user.id, forAgentId, {
      source_kind: file.name.toLowerCase().endsWith(".csv") ? "csv" : "excel",
      source_portal: "spreadsheet",
      source_label: sanitiseText(file.name, 200) ?? "spreadsheet",
      status: "failed",
      error: `columns_missing${found ? `: ${found}` : ""}`,
    });
    redirect(failed
      ? `${base}/${failed.id}?error=columns_missing`
      : `${base}?error=columns_missing`);
  }

  const dataRows = grid.slice(headerRow + 1).slice(0, MAX_ITEMS);
  const drafts = dataRows
    .map((row) => rowToDraft(row, map))
    .filter((d) => d.title || d.price !== undefined);   // a blank row is not an item

  if (!drafts.length) redirect(`${base}?error=no_rows`);

  const batch = await createImportBatch(supabase, user.id, forAgentId, {
    source_kind: file.name.toLowerCase().endsWith(".csv") ? "csv" : "excel",
    source_portal: "spreadsheet",
    source_label: sanitiseText(file.name, 200) ?? "spreadsheet",
    status: "ready",
  });
  if (!batch) redirect(`${base}?error=${forAgentId ? "not_permitted" : "save_failed"}`);

  /* Straight to `ready` or `needs_review` — there is nothing to fetch. The
   * same warning vocabulary as the portal route, so the review screen does not
   * need to know where an item came from. */
  const items = drafts.map((draft) => {
    const warnings: string[] = [];
    if (!draft.title) warnings.push("title_missing");
    if (draft.price === undefined) warnings.push("price_missing");
    if (!draft.propertyType) warnings.push("property_type_missing");
    if (!draft.city && !draft.province && !draft.addressText) warnings.push("location_missing");
    return {
      batch_id: batch.id,
      source_url: null,
      status: warnings.length ? "needs_review" : "ready",
      extracted: draft as unknown as Record<string, unknown>,
      warnings,
    };
  });

  // In chunks: 500 rows in one statement is fine, but the batch cap and the
  // insert limit should not be the same number by accident.
  for (let i = 0; i < items.length; i += 100) {
    const { error } = await supabase.from("import_items").insert(items.slice(i, i + 100));
    if (error) {
      await supabase.from("import_batches")
        .update({ status: "failed", error: "save_failed" }).eq("id", batch.id);
      redirect(`${base}/${batch.id}?error=save_failed`);
    }
  }

  await logAudit({
    action: forAgentId ? "listing_import.assisted_items_added" : "listing_import.file_uploaded",
    entityType: "import_batch",
    entityId: batch.id,
    next: {
      filename: sanitiseText(file.name, 200),
      rows: items.length,
      mapped: Object.keys(map),
      ...(forAgentId ? { agent_id: forAgentId } : {}),
    },
  });

  revalidatePath(base);
  redirect(`${base}/${batch.id}`);
}
