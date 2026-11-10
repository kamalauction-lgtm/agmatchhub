"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/authz";
import { logAudit } from "@/lib/audit";
import { ENTITLEMENT, entitlementInt } from "@/lib/entitlements";
import { getAgentMarket } from "@/lib/listings/market";
import { categoryForType, isTenureAllowed, isTypeAllowed, WIZARD_LOCATION_LEVELS } from "@/lib/listings/vocabulary";

/**
 * Marketplace listing creation (§28 steps 4–6). The agent's submission always
 * lands in pending_review / moderation pending — publication is the
 * moderator's act, and the database trigger enforces that even if this code
 * regressed.
 */

const optNum = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().nonnegative().nullable());

const optInt = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().int().nonnegative().nullable());

const optText = z
  .string()
  .trim()
  .max(5000)
  .transform((v) => (v === "" ? null : v));

const schema = z.object({
  listingType: z.enum(["sale", "rent"]),
  rentPeriod: z.enum(["monthly", "yearly"]).optional().or(z.literal("")),
  propertyCategory: z.enum(["residential", "commercial", "industrial", "land", "other"]),
  // Checked against the agent's own market below (D8): the database allows
  // the union of both vocabularies, so the form must not choose the market.
  propertyType: z.string().trim().min(1).max(40),
  ownershipType: z.string().trim().max(40).optional().or(z.literal("")),
  title: z.string().trim().min(10).max(150),
  description: optText,
  // Newline-separated, from the assistant's chips the agent kept. Optional
  // and bounded: at most six short lines, nothing else is accepted.
  keySellingPoints: z
    .string()
    .optional()
    .transform((s) => (s ?? "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 6).map((x) => x.slice(0, 120))),
  price: z.string().trim().min(1).transform(Number).pipe(z.number().positive()),
  locationId: z.string().uuid().optional().or(z.literal("")),
  generalAddress: optText,
  buildingName: optText,
  postalCode: optText,
  landSize: optNum,
  buildingSize: optNum,
  bedrooms: optInt,
  bathrooms: optInt,
  floors: optInt,
  parkingSpaces: optInt,
  yearBuilt: optInt,
  furnishing: z.enum(["unfurnished", "partially", "fully"]).optional().or(z.literal("")),
  condition: z
    .enum(["new", "excellent", "good", "needs_renovation", "under_construction"])
    .optional()
    .or(z.literal("")),
  facilities: optText, // comma-separated
});

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  // Random suffix keeps slugs unique without leaking a counter.
  const suffix = crypto.randomUUID().slice(0, 8);
  return `${base}-${suffix}`;
}

const IMG_MAX_BYTES = 10 * 1024 * 1024;
const IMG_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const IMG_MAX_COUNT = 15;

export async function createListing(formData: FormData): Promise<void> {
  const user = await requireUser();
  const supabase = await createClient();

  const parsed = schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0] ?? "form";
    redirect(`/listings/new?error=invalid&field=${String(field)}`);
  }
  const d = parsed.data;

  if (d.listingType === "rent" && !d.rentPeriod) {
    redirect("/listings/new?error=invalid&field=rentPeriod");
  }

  /* D8 (P0-d-1b): the listing belongs to the agent's market. Country,
     currency, unit and language come from the profile and `countries`, never
     from the form, and a type, tenure or location from another market is
     refused rather than stored under the wrong flag. */
  const market = await getAgentMarket(supabase, user.id);
  if (!market) redirect("/listings/new?error=market_unavailable");
  if (!isTypeAllowed(market.country, d.propertyType)) {
    redirect("/listings/new?error=invalid&field=propertyType");
  }
  if (d.ownershipType && !isTenureAllowed(market.country, d.ownershipType)) {
    redirect("/listings/new?error=invalid&field=ownershipType");
  }
  const propertyCategory = categoryForType(d.propertyType, d.propertyCategory);

  /* Quota (§28 step 19), resolved from the entitlement engine rather than a
     constant: plan allowance plus referral bonuses plus admin grants. The
     same function backs the admin's "why does this agent have N slots"
     explanation, so enforcement and explanation cannot disagree. */
  const activeLimit = await entitlementInt(user.id, ENTITLEMENT.listingActiveLimit);
  const { count } = await supabase
    .from("listings")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", user.id)
    .in("status", ["draft", "pending_review", "published"]);
  if ((count ?? 0) >= activeLimit) {
    redirect("/listings?error=quota");
  }

  // Photos: validated before anything is written.
  const photos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length > IMG_MAX_COUNT) redirect("/listings/new?error=too_many_photos");
  for (const p of photos) {
    if (!IMG_TYPES.has(p.type)) redirect("/listings/new?error=bad_photo_type");
    if (p.size > IMG_MAX_BYTES) redirect("/listings/new?error=photo_too_large");
  }

  // Location: denormalised names + ancestor ids come from the chosen row.
  let location: {
    id: string;
    ancestor_ids: string[];
    path_names: string[];
  } | null = null;
  if (d.locationId) {
    const { data } = await supabase
      .from("locations")
      .select("id, ancestor_ids, path_names, level, name, country_code")
      .eq("id", d.locationId)
      .single();
    if (!data || data.country_code !== market.country || !WIZARD_LOCATION_LEVELS[market.country].includes(data.level)) {
      redirect("/listings/new?error=invalid&field=locationId");
    }
    if (data) {
      location = {
        id: data.id,
        ancestor_ids: [...(data.ancestor_ids ?? []), data.id],
        path_names: [...(data.path_names ?? [])],
      };
    }
  }
  const pathNames = location?.path_names ?? [];

  // 1. Property (the physical asset).
  const { data: hidProp } = await supabase.rpc("next_human_id", { p_prefix: "PRP" });
  const { data: property, error: propErr } = await supabase
    .from("properties")
    .insert({
      human_readable_id: hidProp,
      agent_id: user.id,
      country_code: market.country,
      property_category: propertyCategory,
      property_type: d.propertyType,
      ownership_type: d.ownershipType || null,
      location_id: location?.id ?? null,
      ancestor_location_ids: location?.ancestor_ids ?? [],
      province_name: pathNames[0] ?? null,
      regency_name: pathNames[1] ?? null,
      district_name: pathNames[2] ?? null,
      village_name: pathNames[3] ?? null,
      postal_code: d.postalCode,
      general_address: d.generalAddress,
      building_name: d.buildingName,
      land_size: d.landSize,
      building_size: d.buildingSize,
      measurement_unit: market.unit,
      bedrooms: d.bedrooms,
      bathrooms: d.bathrooms,
      floors: d.floors,
      parking_spaces: d.parkingSpaces,
      year_built: d.yearBuilt,
      furnishing: d.furnishing || null,
      property_condition: d.condition || null,
      facilities: d.facilities
        ? d.facilities.split(",").map((f) => f.trim()).filter(Boolean).slice(0, 20)
        : [],
      created_by: user.id,
    })
    .select("id")
    .single();
  if (propErr || !property) redirect(`/listings/new?error=save_failed`);

  // 2. Listing (this marketing of it).
  const { data: hidLst } = await supabase.rpc("next_human_id", { p_prefix: "LST" });
  const { data: listing, error: lstErr } = await supabase
    .from("listings")
    .insert({
      human_readable_id: hidLst,
      property_id: property.id,
      agent_id: user.id,
      listing_type: d.listingType,
      status: "pending_review",
      moderation_state: "pending",
      currency: market.currency,
      price: d.price,
      rent_period: d.listingType === "rent" ? d.rentPeriod || "monthly" : null,
      language: market.language,
      title: d.title,
      description: d.description,
      key_selling_points: d.keySellingPoints,
      slug: slugify(d.title),
      created_by: user.id,
    })
    .select("id, human_readable_id")
    .single();
  if (lstErr || !listing) redirect(`/listings/new?error=save_failed`);

  // 3. Photos — owner-folder path; first one is the cover.
  // MVP: stored as-is and marked ready. EXIF/GPS strip + thumbnails are a
  // documented pre-launch requirement (00036 header).
  let position = 0;
  for (const photo of photos) {
    const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/${listing.id}/${position}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("listing-media-public")
      .upload(path, photo, { contentType: photo.type, upsert: false });
    if (upErr) continue; // a failed photo must not lose the listing

    await supabase.from("listing_media").insert({
      listing_id: listing.id,
      kind: "image",
      storage_path: `listing-media-public/${path}`,
      processed_path: `listing-media-public/${path}`,
      thumbnail_path: `listing-media-public/${path}`,
      position,
      is_cover: position === 0,
      byte_size: photo.size,
      processing_state: "ready",
    });
    position++;
  }

  await logAudit({
    action: "listing.submitted",
    entityType: "listing",
    entityId: listing.id,
    next: { human_readable_id: listing.human_readable_id, photos: position },
  });

  redirect(`/listings?submitted=${listing.human_readable_id}`);
}
