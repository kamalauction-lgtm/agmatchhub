import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * CLIENT-SAFE PROJECTION (§21, §78) — the only shape that may ever reach a
 * buyer/tenant browser. Explicit whitelist: fields are copied one by one from
 * the database row; anything not listed here does not exist client-side.
 *
 * Must NEVER include: Supply Agent identity/agency/licence, commission or
 * co-broke terms, minimum acceptable price, source classification or source
 * identities, full address, unit number, viewing instructions, internal
 * remarks, platform submission IDs, appointment/owner-authority details.
 */
export type ClientSafeProperty = {
  /** Presentation-property id — safe handle for feedback actions. */
  ppid: string;
  position: number;
  agentNote: string | null;
  title: string;
  category: string;
  propertyType: string | null;
  generalLocation: string;
  price: number | null;
  monthlyRental: number | null;
  currency: string;
  negotiable: string;
  builtUp: number | null;
  landArea: number | null;
  measurementUnit: string;
  bedrooms: number | null;
  bathrooms: number | null;
  carParks: number | null;
  floorLevel: string | null;
  furnishing: string | null;
  condition: string | null;
  facilities: string[];
  description: string | null;
  keySellingPoints: string | null;
  nearbyAmenities: string | null;
  clientRemarks: string | null;
  availability: string;
  images: { url: string; isCover: boolean }[];
};

const SIGNED_URL_TTL = 60 * 30; // 30 min

export async function getClientSafeProperties(
  presentationId: string,
): Promise<ClientSafeProperty[]> {
  const service = createServiceClient();

  const { data: rows } = await service
    .from("client_presentation_properties")
    .select(
      `id, position, custom_note,
       property_submissions (
         title, property_category, property_type, city, district, state_region,
         general_address, currency, asking_price, monthly_rental, negotiable,
         measurement_unit, built_up, land_area, bedrooms, bathrooms, car_parks,
         floor_level, furnishing, property_condition, facilities, description,
         key_selling_points, nearby_amenities, client_safe_remarks,
         availability_status,
         property_submission_media ( storage_path, kind, is_cover, position )
       )`,
    )
    .eq("presentation_id", presentationId)
    .order("position");

  if (!rows) return [];

  const out: ClientSafeProperty[] = [];
  for (const row of rows) {
    const s = Array.isArray(row.property_submissions)
      ? row.property_submissions[0]
      : row.property_submissions;
    if (!s) continue;

    const media = (s.property_submission_media ?? [])
      .filter((m: { kind: string }) => m.kind === "image")
      .sort((a: { position: number }, b: { position: number }) => a.position - b.position);

    const images: { url: string; isCover: boolean }[] = [];
    for (const m of media) {
      const { data } = await service.storage
        .from("property-original-private")
        .createSignedUrl(m.storage_path, SIGNED_URL_TTL);
      if (data?.signedUrl) images.push({ url: data.signedUrl, isCover: m.is_cover });
    }

    out.push({
      ppid: row.id,
      position: row.position,
      agentNote: row.custom_note,
      title: s.title,
      category: s.property_category,
      propertyType: s.property_type,
      generalLocation:
        s.general_address ||
        [s.district, s.city, s.state_region].filter(Boolean).join(", "),
      price: s.asking_price == null ? null : Number(s.asking_price),
      monthlyRental: s.monthly_rental == null ? null : Number(s.monthly_rental),
      currency: s.currency,
      negotiable: s.negotiable,
      builtUp: s.built_up == null ? null : Number(s.built_up),
      landArea: s.land_area == null ? null : Number(s.land_area),
      measurementUnit: s.measurement_unit,
      bedrooms: s.bedrooms,
      bathrooms: s.bathrooms,
      carParks: s.car_parks,
      floorLevel: s.floor_level,
      furnishing: s.furnishing,
      condition: s.property_condition,
      facilities: s.facilities ?? [],
      description: s.description,
      keySellingPoints: s.key_selling_points,
      nearbyAmenities: s.nearby_amenities,
      clientRemarks: s.client_safe_remarks,
      availability: s.availability_status,
      images,
    });
  }
  return out;
}
