import type { StudioInput } from "@/lib/ai/listing-writer";
import type { StudioListing } from "./listings";

/**
 * One listing → the writer's input, used by the Studio page (deterministic
 * drafts) and the AI Marketing Studio action (model drafts) so both see the
 * same facts. Pure: no server imports, so it is unit-testable.
 *
 * `labelOf` resolves the property-type slug in the LISTING's language — the
 * copy follows the listing, not the UI locale (§4.5).
 */
export function buildStudioInput(listing: StudioListing, labelOf: (slug: string) => string): StudioInput {
  return {
    title: listing.title,
    url: listing.share_url,
    language: listing.language,
    propertyTypeSlug: listing.property_type,
    listingType: listing.listing_type,
    propertyTypeLabel: labelOf(listing.property_type),
    province: listing.province_name,
    regency: listing.regency_name,
    area: listing.district_name ?? listing.general_address,
    buildingName: listing.building_name,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    parking: listing.parking_spaces,
    floors: listing.floors,
    landSize: listing.land_size,
    buildingSize: listing.building_size,
    yearBuilt: listing.year_built,
    furnishing: listing.furnishing,
    condition: listing.property_condition,
    ownership: listing.ownership_type,
    facilities: listing.facilities,
    price: listing.price,
    rentPeriod: listing.rent_period,
    negotiable: listing.price_negotiable,
  };
}

/** The copy language a listing wants: its own `language`, narrowed to what the dictionaries carry. */
export function copyLocaleFor(listing: Pick<StudioListing, "language">): "id" | "en" | "ms" {
  return listing.language === "en" ? "en" : listing.language === "ms" ? "ms" : "id";
}
