import { describe, it, expect } from "vitest";
import {
  PLATFORM_TYPES, TENURES, TYPES_BY_CATEGORY, WIZARD_LOCATION_LEVELS,
  isTypeAllowed, isTenureAllowed, categoryForType, asMarketCountry,
} from "../../../../apps/hub/src/lib/listings/vocabulary";
import { writeDescription, writeTitles, type WriterInput } from "../../../../apps/hub/src/lib/ai/listing-writer";

/**
 * D8 (P0-d-1b): one vocabulary per market, shared by the wizard, its server
 * action and partner ingest. The database accepts the union of both markets
 * (00075), so these lists are what keeps a Malaysian listing Malaysian.
 */

// The 00075 check constraints, copied by hand: if a key is added there, it must be added here.
const DB_TYPES = [
  "rumah", "apartemen", "ruko", "rukan", "kondominium", "villa", "kost", "gudang", "pabrik", "kantor", "toko", "hotel", "tanah", "kavling",
  "terrace", "semi_detached", "bungalow", "townhouse", "cluster_home", "condominium", "serviced_residence", "apartment", "flat", "soho",
  "penthouse", "shoplot", "shop_office", "retail_space", "office_space", "factory", "warehouse", "agricultural_land", "residential_land",
  "commercial_land", "lainnya",
];
const DB_TENURES = ["shm", "hgb", "hgu", "hp", "hbg", "girik", "ppjb", "adat", "freehold", "leasehold_99", "leasehold_60", "leasehold_other",
  "malay_reserve", "bumi_lot", "strata", "lainnya"];

describe("listing vocabulary per market", () => {
  it("every key offered is one the database accepts", () => {
    for (const c of ["ID", "MY"] as const) {
      for (const t of PLATFORM_TYPES[c]) expect(DB_TYPES).toContain(t);
      for (const o of TENURES[c]) expect(DB_TENURES).toContain(o);
    }
  });

  it("Indonesian agents keep exactly today's list", () => {
    expect([...PLATFORM_TYPES.ID].sort()).toEqual(
      ["rumah", "apartemen", "ruko", "rukan", "kondominium", "villa", "kost", "gudang", "pabrik", "kantor", "toko", "hotel", "tanah", "kavling", "lainnya"].sort(),
    );
    expect(TENURES.ID).toEqual(["shm", "hgb", "hgu", "hp", "hbg", "girik", "strata", "ppjb", "adat", "lainnya"]);
    expect(WIZARD_LOCATION_LEVELS.ID).toEqual(["province", "regency"]);
  });

  it("markets never borrow each other's keys (except the shared ones)", () => {
    expect(isTypeAllowed("MY", "rumah")).toBe(false);
    expect(isTypeAllowed("MY", "ruko")).toBe(false);
    expect(isTypeAllowed("ID", "terrace")).toBe(false);
    expect(isTypeAllowed("MY", "terrace")).toBe(true);
    expect(isTenureAllowed("MY", "shm")).toBe(false);
    expect(isTenureAllowed("ID", "freehold")).toBe(false);
    expect(isTenureAllowed("MY", "freehold")).toBe(true);
    expect(isTenureAllowed("MY", "strata")).toBe(true);
    expect(WIZARD_LOCATION_LEVELS.MY).toEqual(["state", "district"]);
  });

  it("categories come from the type, not the card", () => {
    expect(categoryForType("warehouse", "residential")).toBe("industrial");
    expect(categoryForType("residential_land", "residential")).toBe("land");
    expect(categoryForType("terrace", "commercial")).toBe("residential");
    expect(categoryForType("lainnya", "commercial")).toBe("commercial");
    for (const c of ["ID", "MY"] as const) {
      for (const t of TYPES_BY_CATEGORY[c].residential) expect(["residential", "land", "other"]).toContain(categoryForType(t, "residential"));
    }
  });

  it("only live markets are markets", () => {
    expect(asMarketCountry("MY")).toBe("MY");
    expect(asMarketCountry("SG")).toBeNull();
    expect(asMarketCountry(null)).toBeNull();
  });
});

describe("generated copy uses the listing's currency and unit", () => {
  const my: WriterInput = {
    listingType: "sale", propertyTypeLabel: "Terrace house", regency: "Petaling", area: "Kota Damansara",
    bedrooms: 4, bathrooms: 3, buildingSize: 2200, landSize: 1650, price: 980000, currency: "MYR", sizeUnit: "sqft",
  };

  it("a Malaysian listing is priced in ringgit and sized in square feet", () => {
    const d = writeDescription(my);
    expect(d).toMatch(/RM\s?980,000/);
    expect(d).not.toMatch(/Rp|miliar|juta/);
    expect(d).toContain("sq ft");
    expect(d).not.toContain("m²");
    expect(writeTitles(my).join(" ")).not.toMatch(/undefined|null|NaN/);
  });

  it("without a market the writer behaves exactly as before (rupiah, m²)", () => {
    const d = writeDescription({ ...my, currency: undefined, sizeUnit: undefined, price: 3_800_000_000 });
    expect(d).toContain("Rp3,8 miliar");
    expect(d).toContain("m²");
  });
});
