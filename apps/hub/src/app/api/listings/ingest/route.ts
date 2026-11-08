import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { sanitiseText } from "@/lib/import/safe-fetch";
import {
  normalisePropertyType, convertSize, inferCountry, applyCountryDefaults,
  type IngestCountry, type SizeUnit,
} from "@/lib/ingest/normalise";

/**
 * Server-to-server listing ingest (Hero → this platform), 13 Sep 2026;
 * multi-country since 7 Nov 2026 (E10).
 *
 * IQI AG Hero approves an agent's listing and wants a DRAFT here. Writes go
 * through the service client — but only after the shared secret matched, the
 * target agent profile exists and is verified, and the payload passed
 * validation. The listing is created the way the import module creates one
 * (properties → property_private → listings, `creation_source = 'api'`),
 * never published, and recorded in `property_imports` so a re-send updates
 * instead of duplicating.
 *
 * COUNTRY. The draft belongs to an agent, and the agent belongs to a country;
 * that country decides the vocabulary (00075), the location matcher
 * (match_location: ID regency / MY township-or-district), the stored size
 * unit and the defaults for currency and language (countries row). The agent
 * is, in order: the body's `agent_id`; the country's configured ingest agent
 * (`countries.settings.ingest.agent_id`, set on /admin/countries) for the
 * body's `country` or the currency's country; the legacy
 * LISTING_INGEST_AGENT_ID env. A body `country` that disagrees with the
 * agent's country is refused rather than guessed.
 *
 *   curl -X POST https://hub.propertiguru.id/api/listings/ingest \
 *        -H "x-ingest-secret: $LISTING_INGEST_SECRET" -H "content-type: application/json" \
 *        -d '{"external_id":"AG-MY-000012","country":"MY","source_url":"hero://listing/<uuid>","listing":{...},"images":[{"url":"https://…"}]}'
 */

const schema = z.object({
  external_id: z.string().min(3).max(40),                       // AG reference (AG-ID-000012 / AG-MY-000012)
  source_url: z.string().min(8).max(200),                       // hero://listing/<uuid> — idempotency key
  agent_id: z.string().uuid().optional(),
  country: z.enum(["ID", "MY"]).optional(),
  listing: z.object({
    title: z.string().min(5).max(140),
    description: z.string().max(4000).optional().nullable(),
    listing_type: z.enum(["sale", "rent"]),
    rent_period: z.enum(["monthly", "yearly"]).optional().nullable(),
    price: z.number().positive(),
    currency: z.string().length(3).optional().nullable(),        // default: the country's
    property_type: z.string().max(40),
    bedrooms: z.number().int().nonnegative().optional().nullable(),
    bathrooms: z.number().int().nonnegative().optional().nullable(),
    building_size: z.number().positive().optional().nullable(),
    land_size: z.number().positive().optional().nullable(),
    size_unit: z.enum(["sqm", "sqft"]).default("sqm"),          // the unit the sizes above are in
    city: z.string().max(120).optional().nullable(),
    province: z.string().max(120).optional().nullable(),        // ID province / MY state
    address_text: z.string().max(400).optional().nullable(),
    language: z.enum(["id", "en", "ms"]).optional().nullable(), // default: the country's
  }),
  images: z.array(z.object({ url: z.string().url(), is_cover: z.boolean().optional() })).max(20).default([]),
});

export async function POST(request: Request) {
  const secret = process.env.LISTING_INGEST_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (request.headers.get("x-ingest-secret") !== secret) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid", issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 422 });
  const { external_id, source_url, listing: L, images } = parsed.data;
  if (L.listing_type === "rent" && !L.rent_period) return NextResponse.json({ error: "invalid", issues: ["rent_period required for rent"] }, { status: 422 });

  const supabase = createServiceClient();

  // --- which agent, which country ------------------------------------------
  const hintedCountry: IngestCountry = parsed.data.country ?? inferCountry(L.currency);
  let agentId = parsed.data.agent_id ?? null;
  if (!agentId) {
    const { data: c } = await supabase.from("countries").select("settings").eq("code", hintedCountry).maybeSingle();
    const configured = (c?.settings as { ingest?: { agent_id?: string } } | null)?.ingest?.agent_id;
    agentId = configured ?? (hintedCountry === "ID" ? process.env.LISTING_INGEST_AGENT_ID ?? null : null);
  }
  if (!agentId) return NextResponse.json({ error: "not_configured", detail: `no ingest agent for ${hintedCountry} — set it on /admin/countries` }, { status: 503 });

  // The RLS insert policy demands a verified agent; service role bypasses RLS, so enforce it here.
  const { data: agent } = await supabase.from("profiles").select("id, agent_status, country_code").eq("id", agentId).maybeSingle();
  if (!agent) return NextResponse.json({ error: "agent_not_found" }, { status: 422 });
  if (agent.agent_status !== "verified") return NextResponse.json({ error: "agent_not_verified", status: agent.agent_status }, { status: 422 });
  const country = (agent.country_code === "MY" ? "MY" : "ID") as IngestCountry;
  if (parsed.data.country && parsed.data.country !== country) {
    return NextResponse.json({ error: "country_mismatch", detail: `agent is ${country}, payload says ${parsed.data.country}` }, { status: 422 });
  }
  const { data: countryRow } = await supabase.from("countries").select("default_currency, default_language, measurement_unit").eq("code", country).single();
  const defaults = applyCountryDefaults(L, {
    default_currency: countryRow?.default_currency ?? (country === "MY" ? "MYR" : "IDR"),
    default_language: countryRow?.default_language ?? (country === "MY" ? "en" : "id"),
    measurement_unit: (countryRow?.measurement_unit as SizeUnit | undefined) ?? (country === "MY" ? "sqft" : "sqm"),
  });
  const unit = (countryRow?.measurement_unit as SizeUnit | undefined) ?? (country === "MY" ? "sqft" : "sqm");

  // --- normalise -----------------------------------------------------------
  const { propertyType, category } = normalisePropertyType(country, L.property_type);
  const title = sanitiseText(L.title, 140) ?? L.title.slice(0, 140);
  const description = sanitiseText(L.description ?? null, 4000) ?? title;

  // idempotency: the same Hero listing sent twice updates the draft it created
  const { data: prior } = await supabase.from("property_imports").select("id, property_id, listing_id").eq("source_url", source_url).maybeSingle();

  // location by verbatim lookup only — a wrong place is worse than none (same rule as the importers)
  let locationId: string | null = null, provinceName: string | null = null, regencyName: string | null = null, placeName: string | null = null;
  const locText = [L.city, L.province, L.address_text].filter(Boolean).join(" ");
  if (locText) {
    const { data: loc } = await supabase.rpc("match_location", { p_country: country, p_text: locText });
    if (loc && Array.isArray(loc) && loc[0]) { locationId = loc[0].id; provinceName = loc[0].province_name; regencyName = loc[0].regency_name; placeName = loc[0].place_name; }
  }
  const propertyPatch = {
    property_category: category, property_type: propertyType, location_id: locationId, province_name: provinceName, regency_name: regencyName,
    building_size: convertSize(L.building_size, L.size_unit, unit), land_size: convertSize(L.land_size, L.size_unit, unit),
    bedrooms: L.bedrooms ?? null, bathrooms: L.bathrooms ?? null, measurement_unit: unit,
  };
  const listingPatch = {
    listing_type: L.listing_type, rent_period: L.listing_type === "rent" ? L.rent_period : null,
    currency: defaults.currency, price: L.price, language: defaults.language, title, description,
  };

  let propertyId: string, listingId: string, humanId: string | null = null, created = false;
  if (prior?.property_id && prior.listing_id) {
    propertyId = prior.property_id; listingId = prior.listing_id;
    await supabase.from("properties").update(propertyPatch).eq("id", propertyId);
    const { data: lst, error: lstErr } = await supabase.from("listings")
      .update(listingPatch)
      .eq("id", listingId).in("status", ["draft", "pending_review", "rejected"]).select("id, human_readable_id").maybeSingle();
    if (lstErr) return NextResponse.json({ error: "update_failed", detail: lstErr.message }, { status: 500 });
    if (!lst) return NextResponse.json({ error: "listing_not_editable", detail: "already published or archived — edit it in the platform" }, { status: 409 });
    humanId = lst.human_readable_id;
    await supabase.from("property_private").update({ exact_address: sanitiseText(L.address_text ?? null, 400) }).eq("property_id", propertyId);
  } else {
    const { data: hidProp } = await supabase.rpc("next_human_id", { p_prefix: "PRP" });
    const { data: prop, error: propErr } = await supabase.from("properties")
      .insert({ human_readable_id: hidProp, agent_id: agentId, country_code: country, ...propertyPatch, created_by: agentId })
      .select("id").single();
    if (propErr || !prop) return NextResponse.json({ error: "property_insert_failed", detail: propErr?.message }, { status: 500 });
    propertyId = prop.id;
    await supabase.from("property_private").insert({ property_id: propertyId, exact_address: sanitiseText(L.address_text ?? null, 400), internal_notes: `From IQI AG Hero ${external_id} (${source_url})` });
    const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70)}-${propertyId.slice(0, 8)}`;
    const { data: hidLst } = await supabase.rpc("next_human_id", { p_prefix: "LST" });
    const { data: lst, error: lstErr } = await supabase.from("listings")
      .insert({ human_readable_id: hidLst, property_id: propertyId, agent_id: agentId, ...listingPatch,
        status: "draft", moderation_state: "pending", slug, creation_source: "api", created_by: agentId })
      .select("id, human_readable_id").single();
    if (lstErr || !lst) return NextResponse.json({ error: "listing_insert_failed", detail: lstErr?.message }, { status: 500 });
    listingId = lst.id; humanId = lst.human_readable_id; created = true;
    await supabase.from("property_imports").insert({
      batch_id: crypto.randomUUID(), source_file: "hero", source_company: "IQI AG Hero", validation_status: "VALID", normalized: parsed.data as unknown as Record<string, unknown>,
      source_kind: "api", source_portal: "hero", source_url, source_external_id: external_id, property_id: propertyId, listing_id: listingId,
    });
  }

  // photos: copy into the public media bucket under the agent's own prefix (storage RLS convention), first one is the cover
  let stored = 0;
  if (images.length) {
    const { data: existing } = await supabase.from("listing_media").select("id").eq("listing_id", listingId);
    if (!existing?.length) {
      for (let i = 0; i < images.length; i++) {
        try {
          const res = await fetch(images[i].url);
          if (!res.ok) continue;
          const bytes = await res.arrayBuffer();
          const type = res.headers.get("content-type") || "image/jpeg";
          const ext = type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg";
          const path = `${agentId}/${listingId}/${String(i + 1).padStart(2, "0")}.${ext}`;
          const up = await supabase.storage.from("listing-media-public").upload(path, bytes, { contentType: type, upsert: true });
          if (up.error) continue;
          await supabase.from("listing_media").insert({ listing_id: listingId, kind: "image", storage_path: path, position: i, is_cover: images[i].is_cover ?? i === 0, byte_size: bytes.byteLength, processing_state: "ready" });
          stored++;
        } catch { /* skip this image */ }
      }
    }
  }

  await supabase.rpc("log_audit", {
    p_action: created ? "listing.ingested" : "listing.ingest_updated", p_entity_type: "listing", p_entity_id: listingId, p_previous: null,
    p_new: { external_id, source_url, human_readable_id: humanId, images: stored, agent_id: agentId, country, location: placeName },
    p_reason: "server-to-server ingest from IQI AG Hero", p_result: "success",
  });
  const base = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  return NextResponse.json({
    ok: true, created, country, listing_id: listingId, property_id: propertyId, human_readable_id: humanId, status: "draft",
    property_type: propertyType, location: placeName, images: stored, url: `${base}/listings/${listingId}`,
  });
}
