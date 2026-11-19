import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitiseText } from "@/lib/import/safe-fetch";

/**
 * Turn an import batch's `ready` items into NORMAL listings: a row in
 * `properties` and a row in `listings`, written the way the creation wizard
 * writes them, with `creation_source = 'import'` as inert provenance (00056)
 * and `import_items.listing_id` pointing at the result.
 *
 * Shared by the agent's own commit (their session; drafts) and an admin's
 * on-behalf commit (00133: service role after admin_import_batch_commit_authorise;
 * straight to pending_review). The agent's market decides country, currency
 * and listing language (D8), whoever presses the button.
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

export async function commitReadyItems(
  db: SupabaseClient,
  opts: {
    batchId: string;
    agentId: string;
    /** Who pressed the button: the agent, or the admin acting for them. */
    createdBy: string;
    sourcePortal: string | null;
    status: "draft" | "pending_review";
  },
): Promise<{ imported: number; failed: number }> {
  const { data: me } = await db
    .from("profiles")
    .select("country_code, countries(default_currency, default_language, measurement_unit)")
    .eq("id", opts.agentId)
    .maybeSingle();
  const market = (Array.isArray(me?.countries) ? me?.countries[0] : me?.countries) as
    | { default_currency: string | null; default_language: string | null; measurement_unit: string | null }
    | null
    | undefined;
  const countryCode = (me?.country_code as string | null) ?? "ID";
  const defaultCurrency = market?.default_currency ?? (countryCode === "MY" ? "MYR" : "IDR");
  const listingLanguage = market?.default_language ?? (countryCode === "MY" ? "en" : "id");
  const measurementUnit = market?.measurement_unit ?? "sqm";

  const { data: items } = await db
    .from("import_items")
    .select("id, source_url, source_external_id, extracted, overrides")
    .eq("batch_id", opts.batchId)
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

      // Location by verbatim lookup only — a wrong regency is worse than none.
      let locationId: string | null = null;
      let provinceName: string | null = null;
      let regencyName: string | null = null;
      const cityText = [src.city, src.province, src.addressText].filter(Boolean).join(" ");
      if (cityText) {
        const { data: loc } = await db.rpc("match_location", { p_country: countryCode, p_text: cityText });
        if (loc && Array.isArray(loc) && loc[0]) {
          locationId = loc[0].id; provinceName = loc[0].province_name; regencyName = loc[0].regency_name;
        }
      }

      // Human-readable ids come from next_human_id; there is no column default.
      const { data: hidProp } = await db.rpc("next_human_id", { p_prefix: "PRP" });
      const { data: prop, error: propErr } = await db
        .from("properties")
        .insert({
          human_readable_id: hidProp,
          agent_id: opts.agentId,
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
          created_by: opts.createdBy,
        })
        .select("id")
        .single();
      if (propErr || !prop) { failures.push(item.id); continue; }

      await db.from("property_private").insert({
        property_id: prop.id,
        exact_address: sanitiseText(src.addressText as string, 400),
        internal_notes: `Imported from ${opts.sourcePortal ?? "external source"}: ${item.source_url ?? ""}`,
      });

      const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70)}-${prop.id.slice(0, 8)}`;
      const { data: hidLst } = await db.rpc("next_human_id", { p_prefix: "LST" });
      const { data: listing, error: listErr } = await db
        .from("listings")
        .insert({
          human_readable_id: hidLst,
          property_id: prop.id,
          agent_id: opts.agentId,
          listing_type: src.listingType === "rent" ? "rent" : "sale",
          status: opts.status,          // never published here: moderation decides
          moderation_state: "pending",
          currency: typeof src.currency === "string" ? src.currency : defaultCurrency,
          price,
          language: listingLanguage,
          title,
          description: sanitiseText(src.description as string, 4000) ?? title,
          slug,
          creation_source: "import",    // provenance only — gates nothing
          created_by: opts.createdBy,
        })
        .select("id")
        .single();
      if (listErr || !listing) { failures.push(item.id); continue; }

      await db.from("import_items")
        .update({
          status: "imported", property_id: prop.id, listing_id: listing.id,
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
    await db.from("import_items").update({ status: "failed", error: "import_failed" }).in("id", failures);
  }
  await db.from("import_batches").update({
    status: imported ? "completed" : "failed",
    completed_at: new Date().toISOString(),
  }).eq("id", opts.batchId);

  return { imported, failed: failures.length };
}
