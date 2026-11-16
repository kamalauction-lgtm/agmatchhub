/**
 * Inputs whose output the listing writer must keep exactly (P0-d-1c): every
 * Indonesian case, and the existing English Studio cases. Golden output in
 * writer-golden.json was generated from the writer as it was before P0-d-1c.
 */
const base = {
  listingType: "sale" as const, propertyTypeLabel: "Rumah", province: "DKI Jakarta", regency: "Jakarta Selatan", area: "Pondok Indah",
  bedrooms: 3, bathrooms: 2, buildingSize: 150, landSize: 220, price: 3_800_000_000,
};

export const WRITER_CASES = [
  base,
  { ...base, language: "id" },
  { ...base, currency: "IDR", sizeUnit: "sqm" as const },
  { ...base, listingType: "rent" as const, rentPeriod: "yearly" as const, price: 185_000_000, furnishing: "fully", condition: "excellent" },
  { ...base, listingType: "rent" as const, rentPeriod: "monthly" as const, price: 4_500_000, buildingName: "Margonda Residence", landSize: null },
  { ...base, condition: "new", ownership: "shm", facilities: ["kolam renang", "carport"], yearBuilt: 2022, parking: 2, floors: 2 },
  { ...base, propertyTypeLabel: "Tanah", bedrooms: null, bathrooms: null, buildingSize: null, landSize: 700, ownership: "hgb", negotiable: false },
  { ...base, area: null, regency: null, price: null, furnishing: "partially", condition: "needs_renovation" },
  { ...base, price: 950_000, ownership: "strata" },
];

const studioBase = {
  ...base, title: "Rumah 3KT Pondok Indah", url: "https://example.test/a/agent?l=1", propertyTypeSlug: "rumah",
  ownership: "shm", furnishing: "fully", condition: "good", facilities: ["taman", "carport"], parking: 2, floors: 2,
};

export const STUDIO_CASES = [
  { ...studioBase, language: "id" },
  { ...studioBase, language: null },
  { ...studioBase, language: "en" },
  { ...studioBase, language: "en", listingType: "rent" as const, rentPeriod: "monthly" as const, price: 32_000_000, url: null },
  { ...studioBase, language: "id", listingType: "rent" as const, rentPeriod: "yearly" as const, price: 95_000_000, negotiable: false },
];
