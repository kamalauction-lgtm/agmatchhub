// Relative imports only: unit tests load this module without the hub alias.
import { copyLanguage, type CopyLanguage } from "./copy-language";
import { writeDescription, writeTitles, type WriterInput } from "./listing-writer";

/**
 * What the AI Listing Assistant sends to the model, built in one pure place
 * (P0-d-1c) so a test can see exactly which language, currency and unit the
 * model is asked to use.
 *
 *   · `locale` is the LISTING's copy language (Malay: English for now), never
 *     the UI locale; the engine picks its prompt and "Write in …" line by it;
 *   · sizes go with their unit and prices with their currency, so a Malaysian
 *     2,200 sq ft / RM listing is never described to the model as m² or Rp;
 *   · the deterministic draft is the floor, in the same language.
 */
export type ComparablesFact = { n: number; medianPrice: number | null; medianPerSqm: number | null } | null;

export function buildListingCopyRequest(
  input: WriterInput,
  comparables: ComparablesFact,
): { locale: CopyLanguage["lang"]; copy: CopyLanguage; payload: Record<string, unknown>; titles: string[]; description: string } {
  const copy = copyLanguage(input.language);
  const titles = writeTitles(input);
  const description = writeDescription(input);
  const currency = input.currency ?? "IDR";
  const sizeUnit = input.sizeUnit ?? "sqm";
  return {
    locale: copy.lang,
    copy,
    titles,
    description,
    payload: {
      fields: {
        listing_type: input.listingType,
        property_type: input.propertyTypeLabel,
        province: input.province, regency: input.regency, area: input.area, building: input.buildingName,
        bedrooms: input.bedrooms, bathrooms: input.bathrooms, parking: input.parking, floors: input.floors,
        land_size: input.landSize, building_size: input.buildingSize, size_unit: sizeUnit,
        currency, year_built: input.yearBuilt,
        furnishing: input.furnishing, condition: input.condition, ownership: input.ownership,
        facilities: input.facilities ?? [], price: input.price, rent_period: input.rentPeriod, negotiable: input.negotiable ?? false,
      },
      comparables: comparables
        ? {
            count: comparables.n, median_price: comparables.medianPrice, median_price_per_size_unit: comparables.medianPerSqm,
            currency, size_unit: sizeUnit,
            note: "published listings of the same kind in the same regency, in the same country, currency and unit; quote only if useful, never invent others",
          }
        : "none available",
      deterministic_draft: { titles, description },
    },
  };
}
