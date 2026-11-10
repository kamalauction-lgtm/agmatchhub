"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { sanitiseText } from "@/lib/import/safe-fetch";

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

const PROPERTY_TYPES = new Set([
  "rumah", "apartemen", "ruko", "rukan", "kondominium", "villa", "kost",
  "gudang", "pabrik", "kantor", "toko", "hotel", "tanah", "kavling", "lainnya",
]);

const CATEGORY_OF: Record<string, string> = {
  rumah: "residential", apartemen: "residential", kondominium: "residential",
  villa: "residential", kost: "residential",
  ruko: "commercial", rukan: "commercial", kantor: "commercial",
  toko: "commercial", hotel: "commercial",
  gudang: "industrial", pabrik: "industrial",
  tanah: "land", kavling: "land",
};

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

  // D8: the agent's market decides country, currency and listing language.
  const { data: me } = await supabase
    .from("profiles")
    .select("country_code, countries(default_currency, default_language, measurement_unit)")
    .eq("id", user.id)
    .maybeSingle();
  const market = (Array.isArray(me?.countries) ? me?.countries[0] : me?.countries) as
    | { default_currency: string | null; default_language: string | null; measurement_unit: string | null }
    | null
    | undefined;
  const countryCode = (me?.country_code as string | null) ?? "ID";
  const defaultCurrency = market?.default_currency ?? (countryCode === "MY" ? "MYR" : "IDR");
  const listingLanguage = market?.default_language ?? (countryCode === "MY" ? "en" : "id");
  const measurementUnit = market?.measurement_unit ?? "sqm";

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

  /* --- the items ----------------------------------------------------------- */
  const { data: items } = await supabase
    .from("import_items")
    .select("id, source_url, source_external_id, extracted, overrides")
    .eq("batch_id", batchId)
    .eq("status", "ready");

  let imported = 0;
  const failures: string[] = [];

  for (const item of items ?? []) {
    const src = { ...(item.extracted as Record<string, unknown>), ...(item.overrides as Record<string, unknown>) };
    try {
      const propertyType = PROPERTY_TYPES.has(String(src.propertyType)) ? String(src.propertyType) : "lainnya";
      const category = CATEGORY_OF[propertyType] ?? "other";
      const title = sanitiseText(src.title as string, 140);
      const price = Number(src.price);
      if (!title || !Number.isFinite(price) || price <= 0) {
        failures.push(item.id);
        continue;
      }

      // Location by verbatim lookup only — same rule as the Excel importer.
      // A wrong regency is worse than none.
      let locationId: string | null = null;
      let provinceName: string | null = null;
      let regencyName: string | null = null;
      const cityText = [src.city, src.province, src.addressText].filter(Boolean).join(" ");
      if (cityText) {
        const { data: loc } = await supabase.rpc("match_location", { p_country: countryCode, p_text: cityText });
        if (loc && Array.isArray(loc) && loc[0]) {
          locationId = loc[0].id; provinceName = loc[0].province_name; regencyName = loc[0].regency_name;
        }
      }

      /* Human-readable ids are assigned by `next_human_id`, NOT by a column
       * default — there is no default and no trigger. This previously passed
       * `undefined` with a comment claiming otherwise; supabase-js strips
       * undefined keys, so the insert would have hit a not-null violation the
       * first time an agent committed a batch. The wizard at /listings/new
       * has always called the RPC; this path simply did not. */
      const { data: hidProp } = await supabase.rpc("next_human_id", { p_prefix: "PRP" });
      const { data: prop, error: propErr } = await supabase
        .from("properties")
        .insert({
          human_readable_id: hidProp,
          agent_id: user.id,
          country_code: countryCode,
          property_category: category,
          property_type: propertyType,
          location_id: locationId,
          province_name: provinceName,
          regency_name: regencyName,
          building_size: Number.isFinite(Number(src.buildingSize)) ? Number(src.buildingSize) : null,
          land_size: Number.isFinite(Number(src.landSize)) ? Number(src.landSize) : null,
          bedrooms: Number.isFinite(Number(src.bedrooms)) ? Number(src.bedrooms) : null,
          bathrooms: Number.isFinite(Number(src.bathrooms)) ? Number(src.bathrooms) : null,
          measurement_unit: measurementUnit,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (propErr || !prop) { failures.push(item.id); continue; }

      await supabase.from("property_private").insert({
        property_id: prop.id,
        exact_address: sanitiseText(src.addressText as string, 400),
        internal_notes: `Imported from ${batch.source_portal ?? "external source"}: ${item.source_url ?? ""}`,
      });

      const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70)}-${prop.id.slice(0, 8)}`;

      const { data: hidLst } = await supabase.rpc("next_human_id", { p_prefix: "LST" });
      const { data: listing, error: listErr } = await supabase
        .from("listings")
        .insert({
          human_readable_id: hidLst,
          property_id: prop.id,
          agent_id: user.id,
          listing_type: src.listingType === "rent" ? "rent" : "sale",
          status: "draft",              // never auto-published
          moderation_state: "pending",
          currency: typeof src.currency === "string" ? src.currency : defaultCurrency,
          price,
          language: listingLanguage,
          title,
          description: sanitiseText(src.description as string, 4000) ?? title,
          slug,
          creation_source: "import",    // provenance only — gates nothing
          created_by: user.id,
        })
        .select("id")
        .single();
      if (listErr || !listing) { failures.push(item.id); continue; }

      await supabase.from("import_items")
        .update({
          status: "imported", property_id: prop.id, listing_id: listing.id,
          // Photos attach afterwards, one item at a time (00108); the listing
          // is already complete without them.
          ...(Array.isArray(src.imageUrls) && src.imageUrls.length
            ? { media_state: "pending", media_total: Math.min(src.imageUrls.length, 12) }
            : {}),
        })
        .eq("id", item.id);
      imported++;
    } catch (e) {
      console.error("import item failed:", item.id, e);
      failures.push(item.id);
    }
  }

  if (failures.length) {
    await supabase.from("import_items")
      .update({ status: "failed", error: "import_failed" }).in("id", failures);
  }

  await supabase.from("import_batches").update({
    status: imported ? "completed" : "failed",
    completed_at: new Date().toISOString(),
  }).eq("id", batchId);

  await logAudit({
    action: "listing_import.committed",
    entityType: "import_batch",
    entityId: batchId,
    next: { imported, failed: failures.length, consent_record_id: consentId },
  });

  revalidatePath("/listings");
  revalidatePath("/listings/import");
  redirect(`/listings?imported=${imported}`);
}
