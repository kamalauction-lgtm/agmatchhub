"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { adapterFor, AutomaticImportUnavailable, type ImportedListingDraft } from "@/lib/import/adapters";
import { assertSafeUrl, UnsafeUrlError, sanitiseText } from "@/lib/import/safe-fetch";
import { batchOwner, createImportBatch, forAgentFrom, importBase } from "@/lib/import/batches";

/**
 * Agent-driven listing migration.
 *
 * Paste -> Find -> Select -> Review -> Import -> Done.
 *
 * Two rules run through all of it:
 *   1. Nothing is invented. A field the source did not state stays empty and
 *      the agent fills it in.
 *   2. An imported listing is a NORMAL listing. This writes to `properties`
 *      and `listings` exactly as the wizard does, and records origin in
 *      `creation_source` where it is inert (see 00056).
 */

/* -------------------------------------------------------------------------- */
/* Starting a batch                                                            */
/* -------------------------------------------------------------------------- */

const startSchema = z.object({
  portal: z.string().trim().min(2).max(40),
  mode: z.enum(["profile", "urls"]),
  input: z.string().trim().min(4).max(20_000),
});

/**
 * Discovery runs here, in the request, but is bounded: a profile page yields at
 * most 200 links and only the links are read. The expensive part — fetching
 * each listing — happens item by item afterwards, so no single request has to
 * survive 128 page loads.
 */
export async function startImport(formData: FormData): Promise<void> {
  const user = await requireUser();
  // An admin preparing a batch for an agent (00107) posts forAgentId; the
  // database decides whether they may. Everything else is the same flow.
  const forAgentId = forAgentFrom(formData);
  if (forAgentId === "invalid") redirect("/admin/imports?error=invalid");
  const base = importBase(forAgentId);
  const parsed = startSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) redirect(`${base}?error=invalid`);
  const { portal, mode, input } = parsed.data;

  const supabase = await createClient();
  let batchId: string | null = null;

  try {
    const urls: string[] = [];

    if (mode === "urls") {
      // One per line. An agent pasting ten links should not have to do it ten
      // times, and blank lines are not an error worth complaining about.
      for (const line of input.split(/[\s,]+/)) {
        if (!line.trim()) continue;
        urls.push(assertSafeUrl(line).toString());
      }
      if (!urls.length) redirect(`${base}?error=invalid_url`);
    }

    const batch = await createImportBatch(supabase, user.id, forAgentId, {
      source_kind: mode === "profile" ? "profile_url" : "portal_url",
      source_portal: portal,
      source_label: mode === "profile" ? input.slice(0, 200) : `${urls.length} link(s)`,
      status: "processing",
    });
    if (!batch) redirect(`${base}?error=${forAgentId ? "not_permitted" : "save_failed"}`);
    batchId = batch.id;

    if (mode === "profile") {
      const profileUrl = assertSafeUrl(input);
      const adapter = adapterFor(profileUrl);
      if (!adapter.discoverProfileListings) {
        throw new AutomaticImportUnavailable(adapter.source, "profile discovery is not supported");
      }
      const discovered = await adapter.discoverProfileListings(profileUrl);
      urls.push(...discovered.map((d) => d.url));
    }

    if (urls.length) {
      await supabase.from("import_items").insert(
        urls.map((u) => ({ batch_id: batchId, source_url: u, status: "found" as const }))
      );
    }

    await supabase.from("import_batches")
      .update({ status: urls.length ? "ready" : "failed", error: urls.length ? null : "nothing_found" })
      .eq("id", batchId);

    await logAudit({
      action: forAgentId ? "listing_import.assisted_items_added" : "listing_import.batch_started",
      entityType: "import_batch",
      entityId: batch.id,
      next: { portal, mode, found: urls.length, ...(forAgentId ? { agent_id: forAgentId } : {}) },
    });
  } catch (e) {
    const code =
      e instanceof UnsafeUrlError ? e.reason
      : e instanceof AutomaticImportUnavailable ? e.code
      : "fetch_failed";
    if (batchId) {
      await supabase.from("import_batches")
        .update({ status: "failed", error: String(code) }).eq("id", batchId);
      redirect(`${base}/${batchId}?error=${code}`);
    }
    redirect(`${base}?error=${code}`);
  }

  revalidatePath(base);
  redirect(`${base}/${batchId}`);
}

/* -------------------------------------------------------------------------- */
/* Fetching one item                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Fetch and parse a single discovered item.
 *
 * One item at a time, called repeatedly by the review page as it works through
 * the batch. That is the background processing: no request fetches more than
 * one external page, a slow portal delays one row, and a broken listing fails
 * alone — `status = 'failed'` on that item and nothing else disturbed.
 */
export async function processItem(formData: FormData): Promise<void> {
  const user = await requireUser();
  const itemId = String(formData.get("itemId") ?? "");
  if (!z.string().uuid().safeParse(itemId).success) return;

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("import_items")
    .select("id, batch_id, source_url, status, overrides")
    .eq("id", itemId)
    .maybeSingle();               // RLS already scopes this to the agent
  if (!item || !item.source_url) return;
  // Anything but an already-imported item may be fetched again. Re-fetching
  // matters more than it sounds: when extraction improves, an agent whose
  // items are sitting in `needs_review` otherwise has to delete the batch and
  // start over. Their own edits survive — this replaces `extracted`, never
  // `overrides`.
  if (item.status === "imported") return;

  await supabase.from("import_items").update({ status: "processing" }).eq("id", itemId);

  try {
    const url = assertSafeUrl(item.source_url);
    const draft = await adapterFor(url).extractListing(url);

    // Judged on the draft PLUS anything the agent already filled in, so a
    // re-fetch cannot push an item the agent has completed back into review.
    const merged = { ...draft, ...(item.overrides as Record<string, unknown>) };
    const warnings: string[] = [];
    if (!merged.title) warnings.push("title_missing");
    if (merged.price === undefined) warnings.push("price_missing");
    if (!merged.propertyType) warnings.push("property_type_missing");
    if (!merged.city && !merged.province && !merged.addressText) warnings.push("location_missing");

    const owner = await batchOwner(supabase, item.batch_id, user.id);
    const dup = await findDuplicate(supabase, owner?.agentId ?? user.id, draft);

    await supabase.from("import_items").update({
      status: dup ? "duplicate" : warnings.length ? "needs_review" : "ready",
      extracted: draft as unknown as Record<string, unknown>,
      source_external_id: draft.sourceExternalId ?? null,
      duplicate_of_listing_id: dup ?? null,
      warnings,
      error: null,
    }).eq("id", itemId);
  } catch (e) {
    const reason =
      e instanceof UnsafeUrlError ? e.reason
      // The specific code, not a blanket "unavailable": "the portal blocks
      // automated reading" tells the agent to switch to the file import,
      // where "unavailable" tells them nothing they can act on.
      : e instanceof AutomaticImportUnavailable ? e.code
      : "fetch_failed";
    // Failure is per item, by design. The batch continues.
    await supabase.from("import_items")
      .update({ status: "failed", error: String(reason) }).eq("id", itemId);
  }

  revalidatePath(`/listings/import/${item.batch_id}`);
  revalidatePath(`/admin/imports/${item.batch_id}`);
}

/**
 * Practical duplicate detection (§ "keep first version practical").
 *
 * Same source URL or same portal id first — those are certain. Then same agent
 * with the same title in the same place, which is strong. Deliberately NOT
 * price+size alone: units in one tower share both, a lesson already paid for
 * in the Excel importer where that rule produced five false positives.
 */
async function findDuplicate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  agentId: string,
  draft: ImportedListingDraft,
): Promise<string | null> {
  const { data: bySource } = await supabase
    .from("import_items")
    .select("listing_id")
    .eq("source_url", draft.sourceUrl)
    .not("listing_id", "is", null)
    .limit(1);
  if (bySource?.length) return bySource[0].listing_id as string;

  if (draft.title) {
    const { data: byTitle } = await supabase
      .from("listings")
      .select("id")
      .eq("agent_id", agentId)
      .ilike("title", draft.title.slice(0, 60))
      .limit(1);
    if (byTitle?.length) return byTitle[0].id;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Editing an item before import                                               */
/* -------------------------------------------------------------------------- */

const overrideSchema = z.object({
  itemId: z.string().uuid(),
  title: z.string().trim().max(140).optional(),
  price: z.union([z.coerce.number().positive(), z.literal("")]).optional(),
  propertyType: z.string().trim().max(30).optional(),
  listingType: z.enum(["sale", "rent", ""]).optional(),
  bedrooms: z.union([z.coerce.number().int().min(0).max(50), z.literal("")]).optional(),
  bathrooms: z.union([z.coerce.number().int().min(0).max(50), z.literal("")]).optional(),
  buildingSize: z.union([z.coerce.number().positive(), z.literal("")]).optional(),
  description: z.string().trim().max(4000).optional(),
});

export async function saveItemOverrides(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = overrideSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return;
  const { itemId, ...fields } = parsed.data;

  const overrides: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === "" || v === undefined) continue;
    overrides[k] = typeof v === "string" ? sanitiseText(v, 4000) : v;
  }

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("import_items").select("batch_id, extracted, warnings").eq("id", itemId).maybeSingle();
  if (!item) return;

  // Re-check readiness against extracted + overrides together: filling in the
  // missing price is exactly what moves an item from needs_review to ready.
  const merged = { ...(item.extracted as Record<string, unknown>), ...overrides };
  const stillMissing = ["title", "price", "propertyType"].filter((f) => merged[f] == null);

  await supabase.from("import_items").update({
    overrides,
    status: stillMissing.length ? "needs_review" : "ready",
    warnings: stillMissing.map((f) => `${f}_missing`),
  }).eq("id", itemId);

  const owner = await batchOwner(supabase, item.batch_id, user.id);
  if (owner?.assisted) {
    await logAudit({
      action: "listing_import.assisted_item_edited",
      entityType: "import_item",
      entityId: itemId,
      next: { batch_id: item.batch_id, agent_id: owner.agentId, fields: Object.keys(overrides) },
    });
  }
  revalidatePath(`/listings/import/${item.batch_id}`);
  revalidatePath(`/admin/imports/${item.batch_id}`);
}

export async function setItemStatus(formData: FormData): Promise<void> {
  const user = await requireUser();
  const itemId = String(formData.get("itemId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!["skipped", "ready", "found"].includes(status)) return;

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("import_items").select("batch_id").eq("id", itemId).maybeSingle();
  if (!item) return;
  await supabase.from("import_items").update({ status }).eq("id", itemId);
  const owner = await batchOwner(supabase, item.batch_id, user.id);
  if (owner?.assisted) {
    await logAudit({
      action: "listing_import.assisted_item_edited",
      entityType: "import_item",
      entityId: itemId,
      next: { batch_id: item.batch_id, agent_id: owner.agentId, status },
    });
  }
  revalidatePath(`/listings/import/${item.batch_id}`);
  revalidatePath(`/admin/imports/${item.batch_id}`);
}
